const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { spawn } = require('child_process');
const path = require('path');
const upload = require('../middleware/upload');
const crypto = require('crypto');
const fs = require('fs');

// ── TinEye helper ─────────────────────────────────────────────────────────────
// Requires env vars: TINEYE_API_KEY and TINEYE_API_SECRET
async function callTinEye(imagePath) {
  const apiKey = process.env.TINEYE_API_KEY;
  const apiSecret = process.env.TINEYE_API_SECRET;
  if (!apiKey || !apiSecret || !imagePath || imagePath === 'none') return [];

  try {
    const date = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(12).toString('hex');
    const requestPath = '/rest/search/';

    // TinEye HMAC-SHA256 signing for file upload
    const hmacInput = [apiKey, 'POST', 'image/jpeg', String(date), nonce, requestPath].join('\n');
    const signature = crypto.createHmac('sha256', apiSecret).update(hmacInput).digest('hex');

    const urlStr = `https://api.tineye.com/rest/search/?api_key=${encodeURIComponent(apiKey)}&date=${date}&nonce=${nonce}&api_sig=${signature}`;

    const imgBuffer = fs.readFileSync(imagePath);
    const blob = new Blob([imgBuffer], { type: 'image/jpeg' });
    const form = new FormData();
    form.append('image', blob, 'photo.jpg');

    const response = await fetch(urlStr, { method: 'POST', body: form });
    if (!response.ok) {
      console.error('TinEye HTTP error:', response.status, await response.text());
      return [];
    }

    const data = await response.json();
    return (data.matches || [])
      .slice(0, 10)
      .map(m => ({
        score: Math.round((m.score || 0.5) * 100),
        url: m.backlinks?.[0]?.url || m.image_url || '',
        group: 'TinEye Match',
        title: `TinEye: ${m.domain || 'Found online'}`,
        icon: 'image_search',
        isRisk: false,
        isTargetedSearch: false,
        crawled: m.crawl_date || null
      }))
      .filter(m => m.url);
  } catch (e) {
    console.error('TinEye error:', e.message);
    return [];
  }
}

// ── Python subprocess wrapper (Promise-based) ─────────────────────────────────
function runBackgroundCheck(imagePath, usernameQuery) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '..', 'python', 'background_check.py');
    const py = spawn('python3', [scriptPath, imagePath, usernameQuery], {
      env: {
        ...process.env,
        VITE_YANDEX_VISION_KEY: process.env.VITE_YANDEX_VISION_KEY,
        VITE_FACECHECK_TOKEN: process.env.VITE_FACECHECK_TOKEN,
        YANDEX_FOLDER_ID: process.env.YANDEX_FOLDER_ID || 'b1g5d3bsuqm0ivg26kvg',
        DEBUG_SCANNER: 'true'
      }
    });
    let output = '';
    let errorOutput = '';
    py.stdout.on('data', d => { output += d.toString(); });
    py.stderr.on('data', d => { errorOutput += d.toString(); });
    py.on('error', () => resolve({ status: 'error', results: [] }));
    py.on('close', () => {
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve({ status: 'error', results: [], debug: errorOutput || output });
      }
    });
  });
}

// ── POST /api/searches/background-check ──────────────────────────────────────
router.post('/background-check', requireAuth, upload.single('file'), async (req, res) => {
  const imagePath = req.file ? req.file.path : 'none';
  const usernameQuery = req.body.username || '';

  try {
    // Run Python scanner and TinEye in parallel
    const [pyResult, tineyeResults] = await Promise.all([
      runBackgroundCheck(imagePath, usernameQuery),
      callTinEye(imagePath)
    ]);

    const combined = [...(pyResult.results || []), ...tineyeResults];
    res.json({ status: 'success', results: combined });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── POST /api/searches/dorks — Google Custom Search (inline dork results) ────
router.post('/dorks', requireAuth, async (req, res) => {
  const { name, username } = req.body;
  const key = process.env.GOOGLE_CSE_KEY;
  const cx = process.env.GOOGLE_CSE_ID;

  if (!key || !cx) {
    return res.status(503).json({ error: 'Google Custom Search not configured. Set GOOGLE_CSE_KEY and GOOGLE_CSE_ID.' });
  }

  const query = username || name;
  if (!query) return res.status(400).json({ error: 'name or username required' });

  const dorkQueries = [
    { label: 'OnlyFans', query: `site:onlyfans.com "${query}"` },
    { label: 'Instagram', query: `site:instagram.com "${query}"` },
    { label: 'Twitter / X', query: `site:twitter.com "${query}"` },
    { label: 'Facebook', query: `site:facebook.com "${query}"` },
    { label: 'LinkedIn', query: `site:linkedin.com "${query}"` },
    { label: 'Escort Sites', query: `"${query}" site:leolist.cc OR site:skipthegames.com OR site:eros.com` },
    { label: 'General Web', query: `"${query}" profile photo` },
    { label: 'Image Files', query: `"${query}" filetype:jpg OR filetype:png` },
  ];

  const settled = await Promise.allSettled(
    dorkQueries.map(async ({ label, query: q }) => {
      const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(q)}&num=5`;
      const r = await fetch(url);
      const data = await r.json();
      if (data.error) throw new Error(data.error.message);
      return {
        dork: label,
        query: q,
        items: (data.items || []).map(item => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
          image: item.pagemap?.cse_thumbnail?.[0]?.src || null
        }))
      };
    })
  );

  const results = settled
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(r => r.items.length > 0);

  res.json({ results });
});

// ── GET /api/searches — user search history ───────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { limit = 10 } = req.query;
  try {
    const { rows } = await db.query(
      'SELECT * FROM searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [req.user.id, limit]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/searches/count ───────────────────────────────────────────────────
router.get('/count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) FROM searches WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ count: parseInt(rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/searches — create search record ─────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { query, results } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO searches (user_id, query, results) VALUES ($1,$2,$3) RETURNING *',
      [req.user.id, query || null, JSON.stringify(results || [])]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
