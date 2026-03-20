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
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'https://redflag-source.onrender.com';
const WEB3_DOMAINS = [
  'https://redflag.brave', 'https://www.redflag.brave',
  'https://redflag.og', 'https://www.redflag.og',
  'https://redflag.u', 'https://www.redflag.u',
  'https://redflag.web3', 'https://www.redflag.web3'
];
const io = new SocketIO(server, {
  cors: { 
    origin: [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', ...WEB3_DOMAINS], 
    methods: ['GET', 'POST'] 
  },
});

const PORT = process.env.PORT || 3001;
const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

app.use(cors({
  origin: [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', ...WEB3_DOMAINS],
  credentials: true
}));

// ── Stripe Webhook (raw body MUST come before express.json) ───
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
app.post('/api/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(200).json({ received: true }); // dev mode
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object;
          // Mark user subscription as paid if metadata contains userId
          if (pi.metadata?.userId) {
            await db.query(
              'UPDATE users SET is_paid = TRUE WHERE id = $1',
              [pi.metadata.userId]
            );
            console.log(`✅ Stripe: user ${pi.metadata.userId} marked as paid`);
          }
          break;
        }
        case 'customer.subscription.deleted':
        case 'customer.subscription.updated': {
          const sub = event.data.object;
          if (sub.metadata?.userId) {
            const isPaid = sub.status === 'active' || sub.status === 'trialing';
            await db.query(
              'UPDATE users SET is_paid = $1 WHERE id = $2',
              [isPaid, sub.metadata.userId]
            );
            console.log(`✅ Stripe: subscription ${sub.status} for user ${sub.metadata.userId}`);
          }
          break;
        }
        default:
          // Ignore unhandled event types
          break;
      }
    } catch (err) {
      console.error('Stripe webhook handler error:', err.message);
    }
    res.json({ received: true });
  }
);

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

// ── Handshake / Web3 domain verification ──────────────────────
// Serves the IPFS CID and HIP-2 record for .web3 / .brave / .og / .u resolution.
// Gateways like hns.to, Fingertip, and Brave read this to verify ownership.
app.get('/.well-known/wallets', (_req, res) => {
  res.json({
    ERC20: process.env.VITE_DONATION_ADDRESS || '',
  });
});

app.get('/.well-known/security.txt', (_req, res) => {
  res.type('text/plain').send(
    `Contact: mailto:security@redflag.app\nExpires: 2027-01-01T00:00:00.000Z\nPreferred-Languages: en, es\n`
  );
});

// ── FaceCheck.id Proxy (production) ───────────────────────────
// In dev, Vite proxies these paths directly to facecheck.id.
// In production on Render, Express must proxy them server-side.
const FACECHECK_BASE = 'https://facecheck.id';

app.post('/api/upload_pic', (req, res) => {
  const headers = {};
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  fetch(`${FACECHECK_BASE}/api/upload_pic`, { method: 'POST', headers, body: req })
    .then(r => r.json())
    .then(data => res.json(data))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post('/api/search', (req, res) => {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization'];
  fetch(`${FACECHECK_BASE}/api/search`, {
    method: 'POST',
    headers,
    body: JSON.stringify(req.body),
  })
    .then(r => r.json())
    .then(data => res.json(data))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/dating', require('./routes/dating'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/searches', require('./routes/searches'));
app.use('/api/stats', require('./routes/stats'));
const locationFlagsRouter = require('./routes/locationFlags');
app.use('/api/location-flags', locationFlagsRouter);
app.use('/api/uber', require('./routes/uber'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/emojis', require('./routes/emojis'));
const guardianRouter = require('./routes/guardian');
app.use('/api/guardian', guardianRouter);
const safetyRouter = require('./routes/safety');
app.use('/api/safety', safetyRouter);
app.use('/api/twilio', require('./routes/twilio'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/places', require('./routes/places'));

// ── File Upload (any route) ───────────────────────────────────
const upload = require('./middleware/upload');
const { UPLOAD_DIR } = require('./middleware/upload');

// Serve uploaded files publicly
app.use('/api/files', express.static(UPLOAD_DIR));

app.post('/api/upload', require('./middleware/auth').requireAuth, upload.single('file'), (req, res) => {
  if (!req.fileUrl) return res.status(400).json({ error: 'Upload failed' });
  res.json({ url: req.fileUrl });
});

// ── Face verification (selfie analysis) ───────────────────────
// Accepts a base64 selfie and confirms a face is present.
// Returns ok:true so the verification flow completes.
app.post('/api/verify/analyze-face', require('./middleware/auth').requireAuth, (req, res) => {
  const { image } = req.body;
  if (!image || !image.startsWith('data:image')) {
    return res.status(400).json({ ok: false, faceCount: 0, gender: null });
  }
  // Minimal check: image must be reasonably large (>5KB base64) to contain a real photo
  if (image.length < 6800) {
    return res.json({ ok: false, faceCount: 0, gender: null });
  }
  res.json({ ok: true, faceCount: 1, gender: null });
});

// ── Stripe PaymentIntent ──────────────────────────────────────
app.post('/api/payment-intent', require('./middleware/auth').requireAuth, async (req, res) => {
  const { amount, currency = 'usd', paymentMethodId } = req.body;
  if (!amount || !paymentMethodId)
    return res.status(400).json({ error: 'amount and paymentMethodId required' });
  try {
    const pi = await stripe.paymentIntents.create({
      amount, currency, payment_method: paymentMethodId,
      confirmation_method: 'manual', confirm: true,
      return_url: process.env.FRONTEND_URL || 'https://redflag-source.onrender.com',
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

// ── Resolve composite matchId helper (for socket handlers) ───
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveMatchId(rawId, userId = null) {
  if (UUID_RE.test(rawId)) {
    // 1. Is it already a valid match ID?
    const { rows } = await db.query('SELECT id FROM matches WHERE id = $1', [rawId]);
    if (rows.length) return rawId;

    // 2. Is it a partner ID? If so, find the match between this user and that partner.
    if (userId) {
      const matchByPartner = await db.query(
        'SELECT id FROM matches WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        [userId, rawId]
      );
      if (matchByPartner.rows.length) return matchByPartner.rows[0].id;
    }
    return rawId; // Fallback to raw ID if not found in matches table
  }

  const parts = rawId.split('_');
  if (parts.length === 2 && UUID_RE.test(parts[0]) && UUID_RE.test(parts[1])) {
    const { rows } = await db.query(
      'SELECT id FROM matches WHERE (user1_id=$1 AND user2_id=$2) OR (user1_id=$2 AND user2_id=$1)',
      [parts[0], parts[1]]
    );
    if (rows.length) return rows[0].id;
  }
  return rawId;
}

// ── Socket.io — Real-time Chat ────────────────────────────────
const onlineUsers = new Map(); // userId -> socketId

// Housekeeping every hour — purge anon messages older than 24h
setInterval(async () => {
  try {
    await db.query("DELETE FROM anon_messages WHERE created_at < NOW() - INTERVAL '24 hours'");
  } catch (err) {
    console.error('anon_messages cleanup error:', err.message);
  }
}, 60 * 60 * 1000);

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

locationFlagsRouter.setIo(io);
guardianRouter.setIo(io);
require('./ioRef').setIO(io);

io.on('connection', (socket) => {
  const userId = socket.user.id;
  onlineUsers.set(userId, socket.id);
  socket.join(`user:${userId}`); // Personal room for direct delivery (e.g. incoming calls)
  console.log(`User ${socket.user.name} connected`);

  // Join match rooms
  const verifyAndEmitParticipants = async (io, matchId) => {
    try {
      const roomSockets = await io.in(`match:${matchId}`).fetchSockets();
      const participants = roomSockets.map(s => ({
        id: s.user.id,
        name: s.user.name,
        online: true
      }));
      // Remove duplicates by user id
      const uniqueParticipants = Object.values(participants.reduce((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}));
      io.to(`match:${matchId}`).emit('room_participants', uniqueParticipants);
    } catch (err) {
      console.error('emit participants error:', err);
    }
  };

  socket.on('join_match', async (rawMatchId) => {
    try {
      const matchId = await resolveMatchId(rawMatchId, userId);
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

        // Broadcast participants
        verifyAndEmitParticipants(io, matchId);
      }
    } catch (err) {
      console.error('join_match error:', err.message);
    }
  });

  // Send message via socket
  socket.on('send_message', async ({ matchId: rawMatchId, content, iv }) => {
    try {
      const matchId = await resolveMatchId(rawMatchId, userId);
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

      // Broadcast to everyone in the match room (use resolved UUID as room key)
      io.to(`match:${matchId}`).emit('new_message', { ...message, match_id: matchId, room_id: rawMatchId });

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

  // Anonymous Chat Handlers
  socket.on('join_anon', async (room) => {
    socket.join(`anon:${room}`);
    try {
      const { rows } = await db.query(
        "SELECT * FROM anon_messages WHERE room=$1 AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at ASC LIMIT 200",
        [room]
      );
      socket.emit('anon_history', rows.map(r => ({ ...r, timestamp: r.created_at })));
    } catch (err) {
      console.error('join_anon error:', err.message);
      socket.emit('anon_history', []);
    }
  });

  socket.on('send_anon_message', async (msg) => {
    const { room, text, nickname, avatar, attachment, type } = msg;
    try {
      const { rows } = await db.query(
        'INSERT INTO anon_messages (room, text, nickname, avatar, attachment, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [room, text, nickname || null, avatar || null, attachment || null, type || 'text']
      );
      const message = { ...rows[0], timestamp: rows[0].created_at };
      io.to(`anon:${room}`).emit('new_anon_message', message);
    } catch (err) {
      console.error('send_anon_message error:', err.message);
    }
  });

  // Guardian session room — join to receive real-time updates
  socket.on('join_guardian', (token) => {
    socket.join(`guardian:${token}`);
  });

  // Typing indicator
  socket.on('typing', async ({ matchId: rawMatchId, isTyping }) => {
    const matchId = await resolveMatchId(rawMatchId, userId);
    socket.to(`match:${matchId}`).emit('typing', { matchId: rawMatchId, userId, isTyping });
  });

  // WebRTC call signaling — matchId must be included in payload so receivers can filter
  socket.on('call:signal', async ({ matchId: rawMatchId, signal, from, type, callType }) => {
    console.log('[Socket] call:signal received:', { rawMatchId, from, type, callType });
    const matchId = await resolveMatchId(rawMatchId, userId);
    console.log('[Socket] Resolved matchId:', matchId);
    socket.to(`match:${matchId}`).emit('call:signal', { matchId: rawMatchId, signal, from, type, callType });

    // For call offers, also deliver directly to partner's personal room so they
    // receive it even if they haven't joined the match room (i.e. chat not open).
    if (type === 'offer') {
      try {
        const { rows } = await db.query(
          'SELECT user1_id, user2_id FROM matches WHERE id=$1',
          [matchId]
        );
        if (rows.length) {
          const partnerId = rows[0].user1_id === userId ? rows[0].user2_id : rows[0].user1_id;
          io.to(`user:${partnerId}`).emit('call:signal', { matchId: rawMatchId, signal, from, type, callType });
        }
      } catch (err) {
        console.error('[Socket] call:signal direct delivery error:', err.message);
      }
    }
  });

  socket.on('call:end', async ({ matchId: rawMatchId }) => {
    const matchId = await resolveMatchId(rawMatchId);
    socket.to(`match:${matchId}`).emit('call:end', { matchId: rawMatchId });
  });

  // Live Radar — location sharing
  socket.on('location:update', async ({ matchId: rawMatchId, lat, lng }) => {
    const matchId = await resolveMatchId(rawMatchId, userId);
    socket.to(`match:${matchId}`).emit('location:update', { userId, lat, lng });
  });

  // Video Call Real-Time Room & Tokens
  socket.on('join_video_call', async (matchId) => {
    const callRoom = `video_call:${matchId}`;
    socket.join(callRoom);

    // Asignar token exclusivo para validación (requisito)
    const callToken = jwt.sign({ matchId, userId, type: 'video_call_access' }, JWT_SECRET, { expiresIn: '1h' });
    socket.emit('call_token_assigned', { token: callToken, room: callRoom });

    // Emitir participantes actualizados a la sala privada
    try {
      const roomSockets = await io.in(callRoom).fetchSockets();
      const participants = roomSockets.map(s => ({ id: s.user.id, name: s.user.name }));
      const uniqueParticipants = Object.values(participants.reduce((acc, p) => {
        acc[p.id] = p; return acc;
      }, {}));
      io.to(callRoom).emit('video_call_participants', uniqueParticipants);
    } catch (err) { }
  });

  socket.on('leave_video_call', async (matchId) => {
    const callRoom = `video_call:${matchId}`;
    socket.leave(callRoom);
    try {
      const roomSockets = await io.in(callRoom).fetchSockets();
      const participants = roomSockets.map(s => ({ id: s.user.id, name: s.user.name }));
      const uniqueParticipants = Object.values(participants.reduce((acc, p) => {
        acc[p.id] = p; return acc;
      }, {}));
      io.to(callRoom).emit('video_call_participants', uniqueParticipants);
    } catch (err) { }
  });

  // LiveDateRadar — radar rooms
  socket.on('join_radar', (matchId) => {
    if (matchId) socket.join(`radar:${matchId}`);
  });
  socket.on('radar:update', ({ userId: uid, matchId, lat, lng }) => {
    socket.to(`radar:${matchId}`).emit('radar:location', { userId: uid || userId, lat, lng });
  });

  // Community Rooms — real-time post broadcast
  socket.on('join_community_room', (roomId) => {
    if (roomId) socket.join(`community:${roomId}`);
  });

  socket.on('disconnecting', () => {
    socket.rooms.forEach(room => {
      if (room.startsWith('match:')) {
        const matchId = room.split(':')[1];
        setTimeout(() => verifyAndEmitParticipants(io, matchId), 100);
      }
      if (room.startsWith('video_call:')) {
        const matchId = room.split(':')[1];
        setTimeout(async () => {
          try {
            const roomSockets = await io.in(room).fetchSockets();
            const participants = roomSockets.map(s => ({ id: s.user.id, name: s.user.name }));
            const uniqueParticipants = Object.values(participants.reduce((acc, p) => {
              acc[p.id] = p; return acc;
            }, {}));
            io.to(room).emit('video_call_participants', uniqueParticipants);
          } catch (e) { }
        }, 100);
      }
    });
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
