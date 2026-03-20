const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

const FSQ_KEY  = process.env.VITE_FOURSQUARE_API_KEY || process.env.FOURSQUARE_API_KEY;
const FSQ_BASE = 'https://api.foursquare.com/v3/places';

// ── Foursquare Category IDs ─────────────────────────────────────────────────
const CATEGORY_IDS = {
  cafe:       '13032,13034',
  restaurant: '13065',
  bar:        '13003',
  cinema:     '10024',
  museum:     '10027',
  library:    '12071',
  park:       '16032,16000,16058',
  public:     '16020,16032',
  all:        '13032,13034,13065,16032,13003,10024,10027,16020,12071,16000',
};

const VIBE_CATEGORIES = {
  'Coffee':       '13032,13034',
  'Dinner':       '13065',
  'Romantic':     '13065,13032',
  'Lively':       '13003,10032',
  'Quiet':        '13032,12071',
  'Public Space': '16020,16032',
  'Study':        '12071,13032',
  'Outdoors':     '16032,16000,16058',
  'Casual':       '13032,13065',
  'First Date':   '13032,10024,10027',
  'Quick Meet':   '13032,13034',
};

// GET /api/places/search?lat=&lng=&type=&keyword=&radius=&limit=
router.get('/search', async (req, res) => {
  const { lat, lng, type = 'all', keyword = '', radius = '3000', limit = '50' } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required' });
  if (!FSQ_KEY)     return res.status(503).json({ error: 'Foursquare API key not configured', results: [] });

  const categories = VIBE_CATEGORIES[keyword] || CATEGORY_IDS[type] || CATEGORY_IDS.all;

  const params = new URLSearchParams({
    ll:         `${lat},${lng}`,
    radius,
    limit,
    categories,
    fields:     'fsq_id,name,geocodes,location,categories,photos,rating,price,hours,popularity,stats',
    ...(keyword && !VIBE_CATEGORIES[keyword] ? { query: keyword } : {}),
  });

  try {
    const response = await fetch(`${FSQ_BASE}/search?${params}`, {
      headers: { Authorization: FSQ_KEY, Accept: 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Foursquare error ${response.status}:`, text);
      return res.status(response.status).json({ error: `Foursquare ${response.status}`, results: [] });
    }

    const data = await response.json();
    res.json({ results: data.results || [] });
  } catch (err) {
    console.error('Places proxy error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

module.exports = router;
