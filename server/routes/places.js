/**
 * Places Proxy — OpenStreetMap Overpass API
 * Completely free, no API key required, real business data worldwide
 */
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// App type → OSM amenity/leisure/tourism tags (Overpass regex)
const TYPE_TAGS = {
  cafe:       { amenity: 'cafe|coffee_shop' },
  restaurant: { amenity: 'restaurant|fast_food' },
  bar:        { amenity: 'bar|pub|biergarten' },
  cinema:     { amenity: 'cinema|theatre' },
  museum:     { tourism: 'museum|gallery' },
  library:    { amenity: 'library' },
  park:       { leisure: 'park|garden|nature_reserve' },
  public:     { amenity: 'marketplace|community_centre', leisure: 'park|plaza' },
  all:        null, // handled separately
};

// Vibe → best OSM filter
const VIBE_TAGS = {
  'Coffee':       { amenity: 'cafe|coffee_shop' },
  'Dinner':       { amenity: 'restaurant' },
  'Romantic':     { amenity: 'restaurant|cafe' },
  'Lively':       { amenity: 'bar|pub|nightclub' },
  'Quiet':        { amenity: 'cafe|library' },
  'Public Space': { leisure: 'park|plaza' },
  'Study':        { amenity: 'library|cafe' },
  'Outdoors':     { leisure: 'park|garden|nature_reserve' },
  'Casual':       { amenity: 'cafe|restaurant|fast_food' },
  'First Date':   { amenity: 'cafe|cinema|restaurant' },
  'Quick Meet':   { amenity: 'cafe|coffee_shop|fast_food' },
};

// OSM tag → app type
const OSM_TYPE_MAP = {
  cafe: 'cafe', coffee_shop: 'cafe',
  restaurant: 'restaurant', fast_food: 'restaurant',
  bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'bar',
  cinema: 'cinema', theatre: 'cinema',
  museum: 'museum', gallery: 'museum',
  library: 'library',
  park: 'park', garden: 'park', nature_reserve: 'park',
  marketplace: 'public', community_centre: 'public', plaza: 'public',
};

const CATEGORY_SAFETY = {
  cafe: 95, restaurant: 88, bar: 75, cinema: 90,
  museum: 93, library: 95, park: 88, public: 90,
};
const CATEGORY_FEATURES = {
  cafe:       ['Public Space', 'Wi-Fi', 'CCTV'],
  restaurant: ['Public Space', 'Staff Present', 'Reservations'],
  bar:        ['ID Required', 'Staff Present', 'CCTV'],
  cinema:     ['Public Space', 'Security', 'Crowds'],
  museum:     ['Public Space', 'Security', 'Staff Present'],
  library:    ['Public Space', 'Wi-Fi', 'Security'],
  park:       ['Public Space', 'Well Lit', 'Patrolled'],
  public:     ['Public Space', 'Well Lit'],
};
const FALLBACK_PHOTOS = {
  cafe:       'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80',
  restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80',
  bar:        'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&q=80',
  cinema:     'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&q=80',
  museum:     'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=400&q=80',
  library:    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80',
  park:       'https://images.unsplash.com/photo-1496417263034-38ec4f0d6b21?w=400&q=80',
  public:     'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&q=80',
};

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function getOsmType(tags) {
  for (const key of ['amenity', 'leisure', 'tourism', 'shop']) {
    if (tags[key]) {
      const t = OSM_TYPE_MAP[tags[key]];
      if (t) return t;
    }
  }
  return 'public';
}

function deriveVibes(type, keyword) {
  const vibes = [];
  if (type === 'cafe')       vibes.push('Coffee', 'Casual');
  if (type === 'bar')        vibes.push('Lively');
  if (type === 'park')       vibes.push('Outdoors');
  if (type === 'restaurant') vibes.push('Dinner');
  if (type === 'cinema')     vibes.push('Movies', 'First Date');
  if (type === 'museum')     vibes.push('Quiet', 'First Date');
  if (type === 'library')    vibes.push('Quiet', 'Study');
  const VIBE_KEYS = ['Casual','Romantic','First Date','Quick Meet','Coffee','Study','Lively','Outdoors','Quiet','Dinner','Public Space'];
  if (keyword && VIBE_KEYS.includes(keyword) && !vibes.includes(keyword)) vibes.push(keyword);
  if (vibes.length === 0) vibes.push('Casual');
  return [...new Set(vibes)];
}

function pseudoRating(id) {
  const seed = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return parseFloat((3.5 + (seed % 15) / 10).toFixed(1));
}

function transformOSM(el, idx, userLat, userLng, keyword) {
  const lat = el.lat ?? el.center?.lat ?? (userLat + 0.001 * idx);
  const lng = el.lon ?? el.center?.lon ?? (userLng + 0.001 * idx);
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'] || `Place ${idx + 1}`;
  if (!tags.name) return null; // skip unnamed places

  const type    = getOsmType(tags);
  const rating  = pseudoRating(el.id);
  const reviews = 50 + (el.id % 200);
  const openNow = tags.opening_hours ? !tags.opening_hours.includes('off') : true;
  const addr    = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
    .filter(Boolean).join(' ') || tags['addr:full'] || 'Address not listed';

  return {
    id:          `osm_${el.type}_${el.id}`,
    name,
    type,
    rating,
    reviews,
    address:     addr,
    lat,
    lng,
    image:       FALLBACK_PHOTOS[type] || FALLBACK_PHOTOS.public,
    safetyScore: Math.min(99, Math.round((CATEGORY_SAFETY[type] || 85) + (rating - 3.5) * 4)),
    priceRange:  tags.fee === 'yes' ? '$' : type === 'park' || type === 'library' ? 'Free' : '$$',
    busyNow:     reviews > 150,
    features:    CATEGORY_FEATURES[type] || ['Public Space'],
    vibe:        deriveVibes(type, keyword),
    openNow,
    closingTime: 'Check Details',
    distance:    distKm(userLat, userLng, lat, lng),
    source:      'openstreetmap',
  };
}

// Build Overpass QL query
function buildQuery(lat, lng, radius, tags) {
  const around = `(around:${radius},${lat},${lng})`;
  const parts = [];

  if (!tags) {
    // 'all' — grab a broad set of dating-relevant places
    const amenities = 'cafe|coffee_shop|restaurant|bar|pub|cinema|library';
    parts.push(`node["amenity"~"${amenities}"]${around};`);
    parts.push(`way["amenity"~"${amenities}"]${around};`);
    parts.push(`node["tourism"~"museum|gallery"]${around};`);
    parts.push(`way["tourism"~"museum|gallery"]${around};`);
    parts.push(`node["leisure"~"park|garden"]${around};`);
    parts.push(`way["leisure"~"park|garden"]${around};`);
  } else {
    for (const [key, val] of Object.entries(tags)) {
      parts.push(`node["${key}"~"${val}"]${around};`);
      parts.push(`way["${key}"~"${val}"]${around};`);
    }
  }

  return `[out:json][timeout:25];(\n${parts.join('\n')}\n);out body center qt 60;`;
}

// GET /api/places/search?lat=&lng=&type=&keyword=&radius=&limit=
router.get('/search', async (req, res) => {
  const { lat, lng, type = 'all', keyword = '', radius = '5000', limit = '60' } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required', results: [] });

  const tags  = VIBE_TAGS[keyword] || TYPE_TAGS[type] || null;
  const query = buildQuery(lat, lng, radius, tags);

  try {
    const response = await fetch(OVERPASS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Overpass error:', response.status, text.slice(0, 200));
      return res.status(502).json({ error: `Overpass ${response.status}`, results: [] });
    }

    const data = await response.json();
    const raw  = data.elements || [];

    const results = raw
      .map((el, i) => transformOSM(el, i, Number(lat), Number(lng), keyword))
      .filter(Boolean)
      .slice(0, Number(limit));

    results.sort((a, b) => b.safetyScore - a.safetyScore);
    res.json({ results });
  } catch (err) {
    console.error('Places proxy error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

module.exports = router;
