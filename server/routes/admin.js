/**
 * admin.js — Admin endpoints for managing the local face database.
 *
 * POST /api/admin/collect   — Download images for a name/query via Google CSE
 * GET  /api/admin/db-stats  — Show local DB stats (people + image counts)
 * DELETE /api/admin/db/:folder — Remove a person folder from the DB
 */
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_DIR = path.join(__dirname, '..', 'python');
const DB_ROOT = path.join(PYTHON_DIR, 'db_images');

// ── Admin check — user must be authenticated AND have is_admin = true in DB ──
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── Helper: run a Python script and return parsed JSON output ─────────────────
function runPython(scriptName, args = [], envExtra = {}) {
  return new Promise((resolve) => {
    const scriptPath = path.join(PYTHON_DIR, scriptName);
    const py = spawn('python3', [scriptPath, ...args], {
      env: { ...process.env, ...envExtra }
    });
    let out = '';
    let err = '';
    py.stdout.on('data', d => { out += d.toString(); });
    py.stderr.on('data', d => { err += d.toString(); });
    py.on('error', () => resolve({ error: 'Script not found' }));
    py.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({ error: err || out || 'Script returned no JSON' });
      }
    });
  });
}

// ── POST /api/admin/collect ───────────────────────────────────────────────────
// Body: { query: "John Doe", max_images: 30 }
// Downloads images from Google CSE image search into db_images/<query>/
router.post('/collect', requireAuth, requireAdmin, async (req, res) => {
  const { query, max_images = 30 } = req.body;
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return res.status(400).json({ error: 'query must be at least 2 characters' });
  }
  if (max_images > 100) {
    return res.status(400).json({ error: 'max_images cannot exceed 100' });
  }

  const result = await runPython('collect_images.py', [query.trim(), String(max_images)], {
    GOOGLE_CSE_KEY: process.env.GOOGLE_CSE_KEY,
    GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID
  });

  res.json(result);
});

// ── GET /api/admin/db-stats ───────────────────────────────────────────────────
// Returns list of all people in the local face DB with image counts
router.get('/db-stats', requireAuth, requireAdmin, (req, res) => {
  if (!fs.existsSync(DB_ROOT)) {
    return res.json({ total_people: 0, total_images: 0, people: [] });
  }

  const people = [];
  const entries = fs.readdirSync(DB_ROOT, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderPath = path.join(DB_ROOT, entry.name);
    const files = fs.readdirSync(folderPath).filter(f =>
      /\.(jpg|jpeg|png|webp)$/i.test(f)
    );
    people.push({
      name: entry.name.replace(/_/g, ' '),
      folder: entry.name,
      image_count: files.length
    });
  }

  res.json({
    total_people: people.length,
    total_images: people.reduce((s, p) => s + p.image_count, 0),
    people: people.sort((a, b) => b.image_count - a.image_count)
  });
});

// ── DELETE /api/admin/db/:folder ──────────────────────────────────────────────
// Removes a person's folder from the DB (and their DeepFace .pkl cache)
router.delete('/db/:folder', requireAuth, requireAdmin, (req, res) => {
  const { folder } = req.params;

  // Safety: no path traversal
  if (folder.includes('..') || folder.includes('/') || folder.includes('\\')) {
    return res.status(400).json({ error: 'Invalid folder name' });
  }

  const folderPath = path.join(DB_ROOT, folder);
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  fs.rmSync(folderPath, { recursive: true, force: true });

  // Also remove DeepFace representation cache if it exists
  const cacheFile = path.join(DB_ROOT, folder, 'representations_arcface.pkl');
  if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);

  res.json({ deleted: folder });
});

module.exports = router;
