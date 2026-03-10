require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
});

const PORT = process.env.PORT || 3001;
const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Serve React frontend (dist/) ──────────────────────────────
const DIST = path.join(__dirname, '..', 'dist');
app.use(express.static(DIST, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0' }));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/dating',        require('./routes/dating'));
app.use('/api/posts',         require('./routes/posts'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/searches',      require('./routes/searches'));
app.use('/api/stats',         require('./routes/stats'));

// ── File Upload (any route) ───────────────────────────────────
const upload = require('./middleware/upload');
app.post('/api/upload', require('./middleware/auth').requireAuth, upload.single('file'), (req, res) => {
  if (!req.fileUrl) return res.status(400).json({ error: 'Upload failed' });
  res.json({ url: req.fileUrl });
});

// ── Stripe PaymentIntent ──────────────────────────────────────
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
app.post('/api/payment-intent', require('./middleware/auth').requireAuth, async (req, res) => {
  const { amount, currency = 'usd', paymentMethodId } = req.body;
  if (!amount || !paymentMethodId)
    return res.status(400).json({ error: 'amount and paymentMethodId required' });
  try {
    const pi = await stripe.paymentIntents.create({
      amount, currency, payment_method: paymentMethodId,
      confirmation_method: 'manual', confirm: true,
      return_url: process.env.FRONTEND_URL || 'https://redflag-app.onrender.com',
    });
    if (pi.status === 'requires_action')
      return res.json({ clientSecret: pi.client_secret, requiresAction: true });
    if (pi.status === 'succeeded')
      return res.json({ clientSecret: pi.client_secret });
    res.status(400).json({ error: 'Unexpected status: ' + pi.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sumsub KYC Token ─────────────────────────────────────────
const SUMSUB_APP_TOKEN = process.env.SUMSUB_APP_TOKEN;
const SUMSUB_SECRET_KEY = process.env.SUMSUB_SECRET_KEY;
app.post('/api/sumsub-token', require('./middleware/auth').requireAuth, async (req, res) => {
  const { levelName = 'basic-kyc-level' } = req.body;
  const userId = req.user.id;
  try {
    const ts = Math.floor(Date.now() / 1000);
    const path_ = `/resources/accessTokens?userId=${userId}&levelName=${levelName}`;
    const sig = crypto.createHmac('sha256', SUMSUB_SECRET_KEY || '');
    sig.update(ts + 'POST' + path_);
    const headers = {
      'X-App-Token': SUMSUB_APP_TOKEN,
      'X-App-Access-Ts': ts.toString(),
      'X-App-Access-Sig': sig.digest('hex'),
      'Content-Type': 'application/json',
    };
    const r = await fetch('https://api.sumsub.com' + path_, { method: 'POST', headers });
    const json = await r.json();
    if (!r.ok) return res.status(502).json({ error: json.description || 'Sumsub error' });
    res.json({ token: json.token, userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Socket.io — Real-time Chat ────────────────────────────────
const onlineUsers = new Map(); // userId -> socketId

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('No token'));
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query('SELECT id, name FROM users WHERE id=$1', [payload.sub]);
    if (!rows.length) return next(new Error('User not found'));
    socket.user = rows[0];
    next();
  } catch (err) {
    next(new Error('Auth failed'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  console.log(`User ${socket.user.name} connected`);

  // Join match rooms
  socket.on('join_match', async (matchId) => {
    try {
      const { rows } = await db.query(
        'SELECT id FROM matches WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)',
        [matchId, userId]
      );
      if (rows.length) {
        socket.join(`match:${matchId}`);
        // Mark messages as read
        await db.query(
          'UPDATE messages SET is_read=TRUE WHERE match_id=$1 AND sender_id!=$2',
          [matchId, userId]
        );
      }
    } catch (err) {
      console.error('join_match error:', err.message);
    }
  });

  // Send message via socket
  socket.on('send_message', async ({ matchId, content, iv }) => {
    try {
      const match = await db.query(
        'SELECT * FROM matches WHERE id=$1 AND (user1_id=$2 OR user2_id=$2)',
        [matchId, userId]
      );
      if (!match.rows.length) return;

      const { rows } = await db.query(
        `INSERT INTO messages (match_id, sender_id, content, iv)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [matchId, userId, content, iv || null]
      );
      const message = rows[0];

      await db.query(
        'UPDATE matches SET last_message=$1, last_message_at=NOW() WHERE id=$2',
        [content.substring(0, 100), matchId]
      );

      // Broadcast to everyone in the match room
      io.to(`match:${matchId}`).emit('new_message', message);

      // Send push notification to offline user
      const m = match.rows[0];
      const partnerId = m.user1_id === userId ? m.user2_id : m.user1_id;
      if (!onlineUsers.has(partnerId)) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, body, data)
           VALUES ($1,'message',$2,'New message',$3)`,
          [partnerId, socket.user.name, JSON.stringify({ match_id: matchId })]
        );
      }
    } catch (err) {
      console.error('send_message error:', err.message);
    }
  });

  // Typing indicator
  socket.on('typing', ({ matchId, isTyping }) => {
    socket.to(`match:${matchId}`).emit('user_typing', { userId, isTyping });
  });

  // WebRTC call signaling
  socket.on('call:signal', ({ matchId, signal, from, type, callType }) => {
    socket.to(`match:${matchId}`).emit('call:signal', { signal, from, type, callType });
  });

  socket.on('call:end', ({ matchId }) => {
    socket.to(`match:${matchId}`).emit('call:end');
  });

  // Live Radar — location sharing
  socket.on('location:update', ({ matchId, lat, lng }) => {
    socket.to(`match:${matchId}`).emit('location:update', { userId, lat, lng });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    console.log(`User ${socket.user.name} disconnected`);
  });
});

// ── Catch-all → React app ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'));
});

// ── Start server ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚩 RedFlag server running on port ${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api`);
  console.log(`   Socket.io: enabled\n`);
});
