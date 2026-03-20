/**
 * Places Proxy — Google Places API (Nearby Search)
 * Returns normalized place objects ready for the DatePlanner UI
 */
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

const GOOGLE_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_BASE = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

// App type → Google Places type
const TYPE_MAP = {
  cafe:       'cafe',
  restaurant: 'restaurant',
  bar:        'bar',
  cinema:     'movie_theater',
  museum:     'museum',
  library:    'library',
  park:       'park',
  public:     'point_of_interest',
  all:        null,   // no type filter → returns everything
};

// Vibe keyword → Google keyword param
const VIBE_KEYWORDS = {
  'Coffee':       'coffee cafe',
  'Dinner':       'restaurant dinner',
  'Romantic':     'romantic restaurant',
  'Lively':       'bar nightlife',
  'Quiet':        'quiet cafe library',
  'Public Space': 'plaza park square',
  'Study':        'library cafe study',
  'Outdoors':     'park outdoor nature',
  'Casual':       'cafe restaurant',
  'First Date':   'cafe movie museum',
  'Quick Meet':   'coffee cafe quick',
};

// Google type string → app type label
const GOOGLE_TYPE_MAP = {
  cafe:            'cafe',
  coffee_shop:     'cafe',
  restaurant:      'restaurant',
  food:            'restaurant',
  bar:             'bar',
  night_club:      'bar',
  movie_theater:   'cinema',
  museum:          'museum',
  library:         'library',
  park:            'park',
  point_of_interest: 'public',
  establishment:   'public',
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

function getType(types = []) {
  for (const t of types) {
    const mapped = GOOGLE_TYPE_MAP[t];
    if (mapped) return mapped;
  }
  return 'public';
}

function deriveVibes(type, keyword = '') {
  const vibes = [];
  if (type === 'cafe')       vibes.push('Coffee', 'Casual');
  if (type === 'bar')        vibes.push('Lively');
  if (type === 'park')       vibes.push('Outdoors');
  if (type === 'restaurant') vibes.push('Dinner');
  if (type === 'cinema')     vibes.push('Movies');
  if (type === 'museum')     vibes.push('Quiet', 'First Date');
  if (type === 'library')    vibes.push('Quiet', 'Study');
  const VIBE_KEYS = ['Casual','Romantic','First Date','Quick Meet','Coffee','Study','Lively','Outdoors','Quiet','Dinner','Public Space'];
  if (keyword && VIBE_KEYS.includes(keyword) && !vibes.includes(keyword)) vibes.push(keyword);
  if (vibes.length === 0) vibes.push('Casual');
  return [...new Set(vibes)];
}

function calcSafetyScore(type, rating5 = 3.5, reviewCount = 50) {
  const base   = CATEGORY_SAFETY[type] || 85;
  const rBonus = (rating5 - 2.5) * 4;                    // -10 to +10
  const pBonus = Math.min(reviewCount / 100, 5);          // 0 to 5
  return Math.min(Math.max(Math.round(base + rBonus + pBonus), 60), 99);
}

function transformPlace(place, idx, userLat, userLng, keyword) {
  const loc     = place.geometry?.location || {};
  const placeLat = loc.lat || (userLat + 0.001 * idx);
  const placeLng = loc.lng || (userLng + 0.001 * idx);
  const type    = getType(place.types || []);
  const rating5 = place.rating || 3.5;
  const reviews = place.user_ratings_total || 50;
  const priceMap = { 0: 'Free', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
  const priceRange = priceMap[place.price_level] ?? '$$';
  const openNow  = place.opening_hours?.open_now ?? true;

  // Photo URL: use Google Places photo if available
  let image = FALLBACK_PHOTOS[type] || FALLBACK_PHOTOS.public;
  if (place.photos?.[0]?.photo_reference && GOOGLE_KEY) {
    image = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${GOOGLE_KEY}`;
  }

  return {
    id:          place.place_id || `g_${idx}`,
    name:        place.name,
    type,
    rating:      parseFloat(rating5.toFixed(1)),
    reviews,
    address:     place.vicinity || place.formatted_address || 'Address unavailable',
    lat:         placeLat,
    lng:         placeLng,
    image,
    safetyScore: calcSafetyScore(type, rating5, reviews),
    priceRange,
    busyNow:     reviews > 200 && openNow,
    features:    CATEGORY_FEATURES[type] || ['Public Space'],
    vibe:        deriveVibes(type, keyword),
    openNow,
    closingTime: 'Check Details',
    distance:    distKm(userLat, userLng, placeLat, placeLng),
    source:      'google',
  };
}

// GET /api/places/search?lat=&lng=&type=&keyword=&radius=&limit=
router.get('/search', async (req, res) => {
  const { lat, lng, type = 'all', keyword = '', radius = '3000', limit = '50' } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required', results: [] });
  if (!GOOGLE_KEY)  return res.status(503).json({ error: 'Google Maps API key not configured', results: [] });

  const googleType  = TYPE_MAP[type];
  const googleKw    = VIBE_KEYWORDS[keyword] || (keyword || '');

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius,
    key:      GOOGLE_KEY,
    ...(googleType  ? { type: googleType }    : {}),
    ...(googleKw    ? { keyword: googleKw }   : {}),
  });

  try {
    const response = await fetch(`${GOOGLE_BASE}?${params}`);
    const data     = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Google Places error:', data.status, data.error_message);
      return res.status(502).json({ error: `Google: ${data.status}`, results: [] });
    }

    const raw     = (data.results || []).slice(0, Number(limit));
    const results = raw.map((p, i) => transformPlace(p, i, Number(lat), Number(lng), keyword));
    results.sort((a, b) => b.safetyScore - a.safetyScore);

    res.json({ results });
  } catch (err) {
    console.error('Places proxy error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

module.exports = router;
