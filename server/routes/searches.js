const router = require('express').Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { spawn } = require('child_process');
const path = require('path');
const upload = require('../middleware/upload');
const crypto = require('crypto');
const fs = require('fs');

// Manual deep-search links always shown when a photo is uploaded
const MANUAL_SEARCH_LINKS = [
  { title: 'FaceCheck.id', url: 'https://facecheck.id/', icon: 'face' },
  { title: 'Google Images', url: 'https://images.google.com/', icon: 'image_search' },
  { title: 'Yandex Images', url: 'https://yandex.com/images/', icon: 'travel_explore' },
  { title: 'TinEye', url: 'https://tineye.com/', icon: 'image_search' },
  { title: 'PimEyes', url: 'https://pimeyes.com/', icon: 'manage_search' },
  { title: 'Bing Visual', url: 'https://www.bing.com/visualsearch', icon: 'search' },
];

// ── FaceCheck.id — real face-recognition reverse search ──────────────────────
// Uses Node 20 native globals: fetch, FormData, Blob
async function callFaceCheck(imageBuffer) {
  const token = process.env.VITE_FACECHECK_TOKEN;
  if (!token) return [];
  try {
    // 1. Upload photo
    const form = new FormData();
    form.set('images', new Blob([imageBuffer], { type: 'image/jpeg' }), 'photo.jpg');

    const upRes = await fetch('https://facecheck.id/api/upload_pic', {
      method: 'POST',
      headers: { Authorization: token },
      body: form,
    });
    if (!upRes.ok) return [];
    const upData = await upRes.json();
    const idSearch = upData.id_search;
    if (!idSearch) return [];

    // 2. Poll for results (max 30 s, 2 s intervals)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch('https://facecheck.id/api/search', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_search: idSearch, with_progress: true, status_only: false, demo: false }),
      });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData.output?.items?.length) {
        return pollData.output.items.slice(0, 10).map(item => ({
          score: Math.round((item.score || 0.5) * 100),
          url: item.url || '',
          group: 'Face Match',
          title: (item.url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'Profile Found',
          icon: 'face',
          isRisk: true,
          isTargetedSearch: false,
          imgSrc: item.image_url || null,
        })).filter(r => r.url);
      }
      if (pollData.error) break;
    }
    return [];
  } catch (e) {
    console.error('FaceCheck error:', e.message);
    return [];
  }
}

// ── Yandex Vision — image copy search (reverse image lookup) ─────────────────
async function callYandexVision(imageBuffer) {
  const apiKey = process.env.VITE_YANDEX_VISION_KEY;
  const folderId = process.env.YANDEX_FOLDER_ID;
  if (!folderId) return [];
  if (!apiKey) return [];
  try {
    const base64Image = imageBuffer.toString('base64');
    const res = await fetch('https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Api-Key ${apiKey}` },
      body: JSON.stringify({
        folderId,
        analyzeSpecs: [{ content: base64Image, features: [{ type: 'IMAGE_COPY_SEARCH' }] }],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data.results?.[0]?.results?.[0]?.imageCopySearch?.pages || [];
    return pages.slice(0, 10).map(page => ({
      score: Math.round((page.imageScore || 0.5) * 100),
      url: page.url || '',
      group: 'Visual Match',
      title: page.title || (page.url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0] || 'Image Found',
      icon: 'travel_explore',
      isRisk: true,
      isTargetedSearch: false,
    })).filter(r => r.url);
  } catch (e) {
    console.error('Yandex Vision error:', e.message);
    return [];
  }
}

// ── TinEye helper ─────────────────────────────────────────────────────────────
// Requires env vars: TINEYE_API_KEY and TINEYE_API_SECRET
async function callTinEye(imagePath) {
  const apiKey = process.env.TINEYE_API_KEY;
  const apiSecret = process.env.TINEYE_API_SECRET;
  if (!apiKey || !apiSecret || !imagePath || imagePath === 'none') return [];

  // Guard against path traversal: ensure path stays within the upload directory
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || require('os').tmpdir());
  const resolvedPath = path.resolve(imagePath);
  if (!resolvedPath.startsWith(uploadDir + path.sep) && !resolvedPath.startsWith(require('os').tmpdir() + path.sep)) {
    console.warn('[TinEye] Rejected path outside upload dir:', imagePath);
    return [];
  }

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
        YANDEX_FOLDER_ID: process.env.YANDEX_FOLDER_ID || '',
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
  const imagePath = req.file ? req.file.path : null;
  const usernameQuery = req.body.username || '';

  try {
    let imageBuffer = null;
    if (imagePath) {
      try {
        imageBuffer = fs.readFileSync(imagePath);
      } catch {
        // Upload middleware may have already deleted the file and stored it as
        // a base64 data URL in req.fileUrl (for images < 2MB without Cloudinary).
        if (req.fileUrl && req.fileUrl.startsWith('data:')) {
          const b64 = req.fileUrl.split(',')[1];
          if (b64) imageBuffer = Buffer.from(b64, 'base64');
        }
      }
    }

    // Run all engines in parallel
    const [faceCheckResults, yandexResults, tineyeResults, pyResult] = await Promise.all([
      imageBuffer ? callFaceCheck(imageBuffer) : Promise.resolve([]),
      imageBuffer ? callYandexVision(imageBuffer) : Promise.resolve([]),
      imagePath ? callTinEye(imagePath) : Promise.resolve([]),
      // Python for local DB face search (fails gracefully if deps missing)
      imagePath ? runBackgroundCheck(imagePath, usernameQuery) : Promise.resolve({ results: [] }),
    ]);

    // Clean up temp file
    if (imagePath) fs.unlink(imagePath, () => {});

    // Manual deep-search links always included when a photo was uploaded
    const manualLinks = imagePath ? MANUAL_SEARCH_LINKS.map(link => ({
      score: 0,
      url: link.url,
      group: 'Deep Search',
      title: link.title,
      icon: link.icon,
      isRisk: false,
      isTargetedSearch: true,
    })) : [];

    const combined = [
      ...faceCheckResults,
      ...yandexResults,
      ...tineyeResults,
      ...(pyResult.results || []),
      ...manualLinks,
    ];

    res.json({ status: 'success', results: combined });
  } catch (err) {
    console.error('background-check error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
