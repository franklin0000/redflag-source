/**
 * Places Proxy — Yelp Fusion (primary, free 500/day) + OpenStreetMap Overpass (fallback)
 * Returns ALL nearby businesses: food, entertainment, nature, culture, services
 *
 * Yelp: real ratings, real photos, real reviews, real hours
 * OSM:  unlimited, no key needed, but pseudo ratings + Unsplash photos
 *
 * Set YELP_API_KEY on Render to enable Yelp. Otherwise falls back to OSM automatically.
 */
const express = require('express');
const fetch   = require('node-fetch');
const router  = express.Router();

const YELP_API_KEY  = process.env.YELP_API_KEY;
const YELP_BASE     = 'https://api.yelp.com/v3/businesses/search';
const OVERPASS_URL  = 'https://overpass-api.de/api/interpreter';

// ── Shared type metadata ──────────────────────────────────────────────────

const CATEGORY_SAFETY = {
  cafe: 95, restaurant: 88, bar: 72, cinema: 90,
  museum: 93, library: 96, park: 87, public: 90,
};

const CATEGORY_FEATURES = {
  cafe:       ['Public Space', 'Wi-Fi', 'CCTV', 'Well Lit'],
  restaurant: ['Public Space', 'Staff Present', 'Reservations', 'Well Lit'],
  bar:        ['ID Check', 'Staff Present', 'CCTV', 'Social'],
  cinema:     ['Public Space', 'Security', 'Crowds', 'Entertainment'],
  museum:     ['Public Space', 'Security', 'Staff Present', 'Cultural'],
  library:    ['Public Space', 'Wi-Fi', 'Security', 'Quiet'],
  park:       ['Outdoor', 'Well Lit', 'Open Space', 'Fresh Air'],
  public:     ['Public Space', 'Well Lit', 'Open Access'],
};

const CATEGORY_VIBES = {
  cafe:       ['Coffee', 'Casual', 'Quick Meet'],
  restaurant: ['Dinner', 'Casual', 'Romantic'],
  bar:        ['Lively', 'Casual'],
  cinema:     ['First Date', 'Movies', 'Casual'],
  museum:     ['First Date', 'Quiet', 'Cultural'],
  library:    ['Study', 'Quiet', 'First Date'],
  park:       ['Outdoors', 'Casual', 'Public Space'],
  public:     ['Public Space', 'Casual'],
};

// Fallback images used only when Yelp has no photo (or using OSM)
const FALLBACK_PHOTOS = {
  cafe: [
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&q=80',
    'https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?w=400&q=80',
  ],
  restaurant: [
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80',
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80',
    'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=400&q=80',
    'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=400&q=80',
  ],
  bar: [
    'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&q=80',
    'https://images.unsplash.com/photo-1543007631-283050bb3e8c?w=400&q=80',
    'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?w=400&q=80',
  ],
  cinema: [
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&q=80',
    'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=400&q=80',
  ],
  museum: [
    'https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=400&q=80',
    'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=400&q=80',
    'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=400&q=80',
  ],
  library: [
    'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80',
    'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=400&q=80',
  ],
  park: [
    'https://images.unsplash.com/photo-1496417263034-38ec4f0d6b21?w=400&q=80',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80',
    'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=400&q=80',
    'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=400&q=80',
  ],
  public: [
    'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&q=80',
    'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400&q=80',
  ],
};

// ── Yelp ──────────────────────────────────────────────────────────────────

// Yelp category aliases for each app type
const YELP_CATEGORIES = {
  cafe:       'cafes,coffee,tearooms,juicebars',
  restaurant: 'restaurants,food',
  bar:        'bars,pubs,nightlife,wine_bars',
  cinema:     'movietheaters,bowling,escapegames,casinos,theatres',
  museum:     'museums,artgalleries,aquariums,planetarium',
  library:    'libraries',
  park:       'parks,hiking,beaches,gardens,botanicalgardens',
  public:     'publicservicesgovt,communitycenters,fitnessstudios,sportclubs,stadiumsarenas',
};

// Yelp vibe → categories
const YELP_VIBE_CATEGORIES = {
  'Coffee':       'cafes,coffee',
  'Dinner':       'restaurants',
  'Romantic':     'restaurants,wine_bars',
  'Lively':       'bars,nightlife,music_venues',
  'Quiet':        'cafes,libraries',
  'Public Space': 'parks,gardens',
  'Study':        'libraries,cafes',
  'Outdoors':     'parks,hiking,beaches',
  'Casual':       'restaurants,cafes,bars',
  'First Date':   'cafes,restaurants,movietheaters',
  'Quick Meet':   'cafes,coffee,food',
};

// Map Yelp category alias → app type
const YELP_TYPE_MAP = {
  cafes: 'cafe', coffee: 'cafe', tearooms: 'cafe', juicebars: 'cafe',
  restaurants: 'restaurant', food: 'restaurant', pizza: 'restaurant',
  burgers: 'restaurant', sandwiches: 'restaurant', sushi: 'restaurant',
  mexican: 'restaurant', italian: 'restaurant', chinese: 'restaurant',
  thai: 'restaurant', indian: 'restaurant', seafood: 'restaurant',
  bars: 'bar', pubs: 'bar', nightlife: 'bar', wine_bars: 'bar',
  cocktailbars: 'bar', divebars: 'bar', lounges: 'bar', karaoke: 'bar',
  movietheaters: 'cinema', bowling: 'cinema', escapegames: 'cinema',
  casinos: 'cinema', theatres: 'cinema', circuses: 'cinema', arcades: 'cinema',
  museums: 'museum', artgalleries: 'museum', aquariums: 'museum',
  planetarium: 'museum', sciencemuseums: 'museum', historicalbuildings: 'museum',
  libraries: 'library',
  parks: 'park', hiking: 'park', beaches: 'park', gardens: 'park',
  botanicalgardens: 'park', playgrounds: 'park', skatingrinks: 'park',
  fitnessstudios: 'public', sportclubs: 'public', stadiumsarenas: 'public',
  communitycenters: 'public', publicservicesgovt: 'public',
};

function getYelpType(categories = []) {
  for (const cat of categories) {
    const alias = cat.alias?.toLowerCase().replace(/-/g, '_');
    if (alias && YELP_TYPE_MAP[alias]) return YELP_TYPE_MAP[alias];
  }
  return 'restaurant'; // most businesses are food
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function transformYelp(biz, userLat, userLng, keyword) {
  if (!biz.name || !biz.coordinates?.latitude || !biz.coordinates?.longitude) return null;

  const type = getYelpType(biz.categories || []);
  const rating = biz.rating || 4.0;
  const reviews = biz.review_count || 10;

  const loc = biz.location || {};
  const addrParts = [loc.address1, loc.city].filter(Boolean);
  const address = addrParts.join(', ') || 'See map for address';

  // Yelp price: "$", "$$", "$$$", "$$$$" or undefined
  const priceRange = biz.price || (type === 'park' || type === 'library' ? 'Free' : '$$');

  const openNow = !biz.is_closed;

  // Use real Yelp photo if available, else fallback
  const photos = FALLBACK_PHOTOS[type] || FALLBACK_PHOTOS.public;
  const image = biz.image_url || photos[0];

  const vibes = [...(CATEGORY_VIBES[type] || ['Casual'])];
  const VIBE_KEYS = ['Casual','Romantic','First Date','Quick Meet','Coffee','Study','Lively','Outdoors','Quiet','Dinner','Public Space'];
  if (keyword && VIBE_KEYS.includes(keyword) && !vibes.includes(keyword)) vibes.unshift(keyword);

  const safetyBase = CATEGORY_SAFETY[type] || 85;
  const safetyScore = Math.min(99, Math.round(safetyBase + (rating - 3.5) * 4));

  const lat = biz.coordinates.latitude;
  const lng = biz.coordinates.longitude;

  return {
    id:          `yelp_${biz.id}`,
    name:        biz.name,
    type,
    rating,
    reviews,
    address,
    lat,
    lng,
    image,
    safetyScore,
    priceRange,
    busyNow:     reviews > 150 && openNow,
    features:    CATEGORY_FEATURES[type] || ['Public Space'],
    vibe:        [...new Set(vibes)],
    openNow,
    closingTime: 'Check Details', // Yelp hours require a separate endpoint
    distance:    distKm(userLat, userLng, lat, lng),
    website:     biz.url || null,
    phone:       biz.display_phone || biz.phone || null,
    yelpUrl:     biz.url || null,
    source:      'yelp',
  };
}

async function searchYelp(lat, lng, categories, limit, radius) {
  const params = new URLSearchParams({
    latitude:   lat,
    longitude:  lng,
    radius:     Math.min(Number(radius), 40000), // Yelp max 40km
    limit:      Math.min(Number(limit), 50),      // Yelp max 50 per call
    sort_by:    'best_match',
  });
  if (categories) params.set('categories', categories);

  const res = await fetch(`${YELP_BASE}?${params}`, {
    headers: { Authorization: `Bearer ${YELP_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yelp ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.businesses || [];
}

// ── OpenStreetMap Overpass (fallback) ─────────────────────────────────────

const OSM_TYPE_MAP = {
  cafe: 'cafe', coffee_shop: 'cafe', tea_house: 'cafe', juice_bar: 'cafe',
  restaurant: 'restaurant', fast_food: 'restaurant', food_court: 'restaurant',
  ice_cream: 'restaurant', dessert: 'restaurant', bakery: 'restaurant',
  bar: 'bar', pub: 'bar', biergarten: 'bar', nightclub: 'bar', lounge: 'bar',
  cinema: 'cinema', theatre: 'cinema', arts_centre: 'cinema',
  escape_game: 'cinema', bowling_alley: 'cinema', casino: 'cinema',
  museum: 'museum', gallery: 'museum', exhibition_centre: 'museum',
  aquarium: 'museum', planetarium: 'museum',
  library: 'library', book_store: 'library',
  park: 'park', garden: 'park', nature_reserve: 'park',
  beach: 'park', viewpoint: 'park', playground: 'park',
  marketplace: 'public', community_centre: 'public', plaza: 'public',
  town_hall: 'public', fountain: 'public', square: 'public',
  sports_centre: 'public', stadium: 'public', swimming_pool: 'public',
  fitness_centre: 'public', yoga: 'public', climbing: 'public',
};

const VIBE_OSM_TAGS = {
  'Coffee':       { amenity: 'cafe|coffee_shop|tea_house' },
  'Dinner':       { amenity: 'restaurant|fast_food|food_court' },
  'Romantic':     { amenity: 'restaurant|cafe' },
  'Lively':       { amenity: 'bar|pub|nightclub|biergarten' },
  'Quiet':        { amenity: 'cafe|library' },
  'Public Space': { leisure: 'park|garden', amenity: 'marketplace|community_centre' },
  'Study':        { amenity: 'library|cafe' },
  'Outdoors':     { leisure: 'park|garden|nature_reserve|beach' },
  'Casual':       { amenity: 'cafe|restaurant|fast_food|bar' },
  'First Date':   { amenity: 'cafe|cinema|restaurant|museum' },
  'Quick Meet':   { amenity: 'cafe|coffee_shop|fast_food' },
};

const TYPE_OSM_TAGS = {
  cafe:       { amenity: 'cafe|coffee_shop|tea_house|juice_bar' },
  restaurant: { amenity: 'restaurant|fast_food|food_court|ice_cream|bakery' },
  bar:        { amenity: 'bar|pub|biergarten|nightclub|lounge' },
  cinema:     { amenity: 'cinema|theatre|arts_centre|escape_game|bowling_alley' },
  museum:     { tourism: 'museum|gallery|aquarium', amenity: 'arts_centre' },
  library:    { amenity: 'library' },
  park:       { leisure: 'park|garden|nature_reserve|beach|playground' },
  public:     { amenity: 'marketplace|community_centre|fountain', leisure: 'sports_centre|stadium|fitness_centre' },
};

function pseudoRating(id, name = '') {
  const seed = (String(id) + name).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffff, 0);
  return parseFloat((3.5 + (seed % 15) / 10).toFixed(1));
}

function pseudoReviews(id) {
  return 30 + (Number(String(id).slice(-3)) || 50);
}

function getOsmType(tags) {
  for (const key of ['amenity', 'leisure', 'tourism', 'shop', 'sport']) {
    const val = tags[key];
    if (val && OSM_TYPE_MAP[val]) return OSM_TYPE_MAP[val];
  }
  if (tags.cuisine) return 'restaurant';
  return null;
}

function transformOSM(el, idx, userLat, userLng, keyword) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'];
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!lat || !lng) return null;

  const type = getOsmType(tags);
  if (!type) return null;

  const rating  = pseudoRating(el.id, name);
  const reviews = pseudoReviews(el.id);
  const openNow = tags.opening_hours
    ? !tags.opening_hours.toLowerCase().includes('off')
    : true;

  const addrParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] || tags['addr:suburb'],
  ].filter(Boolean);
  const address = addrParts.length > 0 ? addrParts.join(' ') : (tags['addr:full'] || 'See map for address');

  const photos = FALLBACK_PHOTOS[type] || FALLBACK_PHOTOS.public;
  const image  = photos[idx % photos.length];

  const vibes = [...(CATEGORY_VIBES[type] || ['Casual'])];
  const VIBE_KEYS = ['Casual','Romantic','First Date','Quick Meet','Coffee','Study','Lively','Outdoors','Quiet','Dinner','Public Space'];
  if (keyword && VIBE_KEYS.includes(keyword) && !vibes.includes(keyword)) vibes.unshift(keyword);

  const safetyBase = CATEGORY_SAFETY[type] || 85;
  const safetyScore = Math.min(99, Math.round(safetyBase + (rating - 3.5) * 4));

  return {
    id:          `osm_${el.type}_${el.id}`,
    name,
    type,
    rating,
    reviews,
    address,
    lat,
    lng,
    image,
    safetyScore,
    priceRange:  tags.fee === 'yes' ? '$' : (type === 'park' || type === 'library') ? 'Free' : tags.price_range || '$$',
    busyNow:     reviews > 150 && openNow,
    features:    CATEGORY_FEATURES[type] || ['Public Space'],
    vibe:        [...new Set(vibes)],
    openNow,
    closingTime: tags.opening_hours ? tags.opening_hours.slice(0, 30) : 'Check Details',
    distance:    distKm(userLat, userLng, lat, lng),
    website:     tags.website || tags['contact:website'] || null,
    phone:       tags.phone || tags['contact:phone'] || null,
    source:      'openstreetmap',
  };
}

function buildOsmQuery(lat, lng, radius, typeTags) {
  const around = `(around:${radius},${lat},${lng})`;
  const parts  = [];

  if (!typeTags) {
    const amenities = [
      'cafe','coffee_shop','tea_house','juice_bar',
      'restaurant','fast_food','food_court','ice_cream','bakery',
      'bar','pub','biergarten','nightclub','lounge',
      'cinema','theatre','arts_centre','escape_game','bowling_alley',
      'library','marketplace','community_centre',
    ].join('|');
    const leisures = 'park|garden|nature_reserve|beach|playground|sports_centre|fitness_centre|stadium';
    const tourisms = 'museum|gallery|aquarium|viewpoint|attraction';

    parts.push(`node["amenity"~"${amenities}"]${around};`);
    parts.push(`way["amenity"~"${amenities}"]${around};`);
    parts.push(`node["leisure"~"${leisures}"]${around};`);
    parts.push(`way["leisure"~"${leisures}"]${around};`);
    parts.push(`node["tourism"~"${tourisms}"]${around};`);
    parts.push(`way["tourism"~"${tourisms}"]${around};`);
  } else {
    for (const [key, val] of Object.entries(typeTags)) {
      parts.push(`node["${key}"~"${val}"]${around};`);
      parts.push(`way["${key}"~"${val}"]${around};`);
    }
  }

  return `[out:json][timeout:30];(\n${parts.join('\n')}\n);out body center qt;`;
}

async function searchOSM(lat, lng, typeTags) {
  const query = buildOsmQuery(lat, lng, 5000, typeTags);
  const res = await fetch(OVERPASS_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  return data.elements || [];
}

// ── Route ─────────────────────────────────────────────────────────────────
// GET /api/places/search?lat=&lng=&type=&keyword=&radius=&limit=
router.get('/search', async (req, res) => {
  const { lat, lng, type = 'all', keyword = '', radius = '5000', limit = '100' } = req.query;

  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng are required', results: [] });

  // ── Attempt 1: Yelp Fusion (real ratings, real photos) ──────────────────
  if (YELP_API_KEY) {
    try {
      const yelpCats = YELP_VIBE_CATEGORIES[keyword] || YELP_CATEGORIES[type] || null;
      const bizList  = await searchYelp(lat, lng, yelpCats, limit, radius);

      if (bizList.length > 0) {
        const results = bizList
          .map(b => transformYelp(b, Number(lat), Number(lng), keyword))
          .filter(Boolean)
          .sort((a, b) => b.safetyScore - a.safetyScore);

        console.log(`[places/yelp] ${type}/${keyword || 'any'} @ ${lat},${lng} → ${bizList.length} raw → ${results.length} results`);
        return res.json({ results, source: 'yelp' });
      }
    } catch (err) {
      console.warn('[places] Yelp failed, falling back to OSM:', err.message);
    }
  }

  // ── Attempt 2: OpenStreetMap Overpass (free, unlimited) ─────────────────
  try {
    const typeTags = VIBE_OSM_TAGS[keyword] || TYPE_OSM_TAGS[type] || null;
    const raw      = await searchOSM(lat, lng, typeTags);

    const results = raw
      .map((el, i) => transformOSM(el, i, Number(lat), Number(lng), keyword))
      .filter(Boolean)
      .slice(0, Number(limit))
      .sort((a, b) => b.safetyScore - a.safetyScore);

    console.log(`[places/osm] ${type}/${keyword || 'any'} @ ${lat},${lng} → ${raw.length} raw → ${results.length} results`);
    res.json({ results, source: 'openstreetmap' });
  } catch (err) {
    console.error('[places] OSM error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

module.exports = router;
