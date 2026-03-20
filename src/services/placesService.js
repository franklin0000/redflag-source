/**
 * Places Service — Server proxy → Foursquare v3 + Mapbox fallback
 * Primary: /api/places/search (server proxies Foursquare, no CORS issues)
 * Fallback: Mapbox Geocoding API (if server unavailable)
 */

const MAPBOX_TOKEN  = import.meta.env.VITE_MAPBOX_TOKEN;
const API_BASE      = import.meta.env.VITE_API_URL || '';

// Foursquare category id → app type label
const FSQ_CATEGORY_TYPE = {
  13032: 'cafe', 13034: 'cafe',
  13065: 'restaurant',
  13003: 'bar',
  10024: 'cinema',
  10027: 'museum',
  12071: 'library',
  16032: 'park',  16020: 'public', 16000: 'park',
};

// Category → safety baseline score
const CATEGORY_SAFETY = {
  cafe: 95, restaurant: 88, bar: 75, cinema: 90,
  museum: 93, library: 95, park: 88, public: 90,
};

// Category → feature tags
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

// Category → fallback Unsplash images (only used if Foursquare photo missing)
const FALLBACK_PHOTOS = {
  cafe:       ['https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&q=80',
               'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&q=80'],
  restaurant: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80',
               'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&q=80'],
  bar:        ['https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&q=80',
               'https://images.unsplash.com/photo-1543007631-283050bb3e8c?w=400&q=80'],
  cinema:     ['https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&q=80'],
  museum:     ['https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=400&q=80'],
  library:    ['https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80'],
  park:       ['https://images.unsplash.com/photo-1496417263034-38ec4f0d6b21?w=400&q=80',
               'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80'],
  public:     ['https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=400&q=80'],
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fsqPhotoUrl(photo, w = 400, h = 250) {
  if (!photo?.prefix || !photo?.suffix) return null;
  return `${photo.prefix}${w}x${h}${photo.suffix}`;
}

function getType(categories = []) {
  for (const cat of categories) {
    const t = FSQ_CATEGORY_TYPE[cat.id];
    if (t) return t;
    // Check parent IDs
    const parentId = Math.floor(cat.id / 1000) * 1000;
    const pt = FSQ_CATEGORY_TYPE[parentId];
    if (pt) return pt;
  }
  return 'public';
}

function deriveVibes(type, categories = [], keyword = '') {
  const vibes = [];
  const catNames = categories.map(c => c.name?.toLowerCase() || '');
  if (type === 'cafe' || catNames.some(n => n.includes('coffee'))) vibes.push('Coffee');
  if (type === 'bar'  || catNames.some(n => n.includes('bar')))    vibes.push('Lively');
  if (type === 'park' || type === 'public')                        vibes.push('Outdoors');
  if (type === 'restaurant')                                       vibes.push('Dinner');
  if (type === 'cinema')                                           vibes.push('Movies');
  if (type === 'museum' || type === 'library')                     vibes.push('Quiet');
  if (['Casual','Romantic','First Date','Quick Meet','Coffee','Study'].includes(keyword)) {
    if (!vibes.includes(keyword)) vibes.push(keyword);
  }
  if (vibes.length === 0) vibes.push('Casual');
  return vibes;
}

function calcSafetyScore(type, rating10 = 7, popularity = 0) {
  const base   = CATEGORY_SAFETY[type] || 85;
  const rBonus = ((rating10 / 10) - 0.5) * 10;   // -5 to +5
  const pBonus = Math.min(popularity / 200, 5);    // 0 to 5
  return Math.min(Math.max(Math.round(base + rBonus + pBonus), 60), 99);
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

// ── Foursquare Search (via server proxy — no CORS issues) ─────────────────

async function searchFoursquare(lat, lng, type = 'all', keyword = '') {
  const params = new URLSearchParams({ lat, lng, type, keyword, radius: '3000', limit: '50' });
  const res = await fetch(`${API_BASE}/api/places/search?${params}`);
  if (!res.ok) throw new Error(`Places API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.results || [];
}

function transformFsqPlace(place, idx, userLat, userLng, keyword) {
  const geo    = place.geocodes?.main || {};
  const placeLat = geo.latitude;
  const placeLng = geo.longitude;
  const type   = getType(place.categories || []);
  const photo  = place.photos?.[0];
  const photoUrl = fsqPhotoUrl(photo) || (FALLBACK_PHOTOS[type] || FALLBACK_PHOTOS.public)[idx % 2];

  const rating10   = place.rating     || 7.0;
  const rating5    = parseFloat((rating10 / 2).toFixed(1));
  const popularity = place.popularity || 0;
  const reviews    = place.stats?.total_ratings || Math.floor(popularity * 0.8) || 50;

  const priceMap = { 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };
  const priceRange = priceMap[place.price] || '$$';

  const openNow  = place.hours?.open_now ?? true;
  const hours    = place.hours?.regular;
  const todayIdx = new Date().getDay(); // 0=Sun
  const todayHours = hours?.find(h => h.day === (todayIdx === 0 ? 7 : todayIdx));
  const closingTime = todayHours?.close ? `${todayHours.close.slice(0,2)}:${todayHours.close.slice(2)}` : 'Check Details';

  const address = [
    place.location?.address,
    place.location?.locality || place.location?.city,
  ].filter(Boolean).join(', ') || 'Address unavailable';

  const dist = (placeLat && placeLng) ? distKm(userLat, userLng, placeLat, placeLng) : null;

  return {
    id:          place.fsq_id || `fsq_${idx}`,
    name:        place.name,
    type,
    rating:      rating5,
    reviews,
    address,
    lat:         placeLat || userLat + 0.001 * idx,
    lng:         placeLng || userLng + 0.001 * idx,
    image:       photoUrl,
    safetyScore: calcSafetyScore(type, rating10, popularity),
    priceRange,
    busyNow:     popularity > 50,
    features:    CATEGORY_FEATURES[type] || ['Public Space'],
    vibe:        deriveVibes(type, place.categories || [], keyword),
    openNow,
    closingTime,
    distance:    dist,
    source:      'foursquare',
  };
}

// ── Mapbox Fallback ────────────────────────────────────────────────────────

async function searchMapbox(lat, lng, type = 'cafe', keyword = '') {
  if (!MAPBOX_TOKEN) throw new Error('MAPBOX_TOKEN missing');
  const query = keyword ? `${keyword} ${type}` : type;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${lng},${lat}&types=poi&access_token=${MAPBOX_TOKEN}&limit=20`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Mapbox API Error');
  const data = await res.json();
  return (data.features || []).map((place, idx) => {
    const pseudo  = (parseInt(place.id.replace(/\D/g, '')) || idx) % 100;
    const rating5 = parseFloat((3.5 + (pseudo % 15) / 10).toFixed(1));
    const mappedType = type === 'public' ? 'park' : type;
    const pool  = FALLBACK_PHOTOS[mappedType] || FALLBACK_PHOTOS.public;
    return {
      id:          place.id,
      name:        place.text,
      type:        mappedType,
      rating:      rating5,
      reviews:     50 + pseudo * 3,
      address:     place.place_name.split(',').slice(0, 2).join(', '),
      lat:         place.center[1],
      lng:         place.center[0],
      image:       pool[idx % pool.length],
      safetyScore: calcSafetyScore(mappedType, rating5 * 2, 30),
      priceRange:  mappedType === 'park' ? 'Free' : '$$',
      busyNow:     false,
      features:    CATEGORY_FEATURES[mappedType] || ['Public Space'],
      vibe:        deriveVibes(mappedType, [], keyword),
      openNow:     true,
      closingTime: 'Check Details',
      distance:    distKm(lat, lng, place.center[1], place.center[0]),
      source:      'mapbox',
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export const placesService = {
  searchSafePlaces: async (lat, lng, type = 'all', keyword = '') => {
    // 1. Try Foursquare first (real data)
    if (FSQ_KEY) {
      try {
        const raw = await searchFoursquare(lat, lng, type, keyword);
        if (raw.length > 0) {
          return raw
            .map((p, i) => transformFsqPlace(p, i, lat, lng, keyword))
            .sort((a, b) => (b.safetyScore - a.safetyScore));
        }
      } catch (err) {
        console.warn('Foursquare failed, trying Mapbox fallback:', err.message);
      }
    }

    // 2. Mapbox fallback
    if (MAPBOX_TOKEN) {
      try {
        const places = await searchMapbox(lat, lng, type === 'all' ? 'cafe' : type, keyword);
        if (places.length > 0) return places;
      } catch (err) {
        console.warn('Mapbox failed, using mock data:', err.message);
      }
    }

    // 3. Static mock as last resort
    return getMockPlaces(lat, lng, type, keyword);
  },

  getPlaceDetails: async () => null,
};

// ── Static Mock (last resort) ──────────────────────────────────────────────

function getMockPlaces(lat, lng, _type, keyword) {
  const places = [
    {
      id: 'mock_1', name: 'The Safe Haven Café', type: 'cafe',
      rating: 4.8, reviews: 243, address: '123 Safety St, Downtown',
      lat: lat + 0.001, lng: lng + 0.001,
      image: FALLBACK_PHOTOS.cafe[0], safetyScore: 98, priceRange: '$$',
      busyNow: true, features: CATEGORY_FEATURES.cafe,
      vibe: ['Coffee', 'Popular', 'Casual'], openNow: true, closingTime: '10:00 PM',
      distance: 0.1, source: 'mock',
    },
    {
      id: 'mock_2', name: 'Bistro Secure', type: 'restaurant',
      rating: 4.5, reviews: 185, address: '456 Guarded Ave, Midtown',
      lat: lat - 0.001, lng: lng - 0.001,
      image: FALLBACK_PHOTOS.restaurant[0], safetyScore: 95, priceRange: '$$$',
      busyNow: false, features: CATEGORY_FEATURES.restaurant,
      vibe: ['Dinner', 'Romantic', 'First Date'], openNow: true, closingTime: '11:00 PM',
      distance: 0.2, source: 'mock',
    },
    {
      id: 'mock_3', name: 'Central Park Safe Zone', type: 'park',
      rating: 4.7, reviews: 320, address: '789 Park Lane, North Side',
      lat: lat + 0.002, lng: lng - 0.002,
      image: FALLBACK_PHOTOS.park[0], safetyScore: 92, priceRange: 'Free',
      busyNow: true, features: CATEGORY_FEATURES.park,
      vibe: ['Outdoors', 'Casual', 'Active'], openNow: true, closingTime: 'Sunset',
      distance: 0.4, source: 'mock',
    },
    {
      id: 'mock_4', name: 'Neon Lounge Bar', type: 'bar',
      rating: 4.3, reviews: 98, address: '22 Velvet St, Arts District',
      lat: lat - 0.002, lng: lng + 0.003,
      image: FALLBACK_PHOTOS.bar[0], safetyScore: 82, priceRange: '$$$',
      busyNow: true, features: CATEGORY_FEATURES.bar,
      vibe: ['Lively', 'Cocktails', 'Popular'], openNow: true, closingTime: '2:00 AM',
      distance: 0.6, source: 'mock',
    },
  ];
  if (!keyword) return places;
  const k = keyword.toLowerCase();
  return places.filter(p =>
    p.name.toLowerCase().includes(k) || p.type.includes(k) ||
    p.vibe.some(v => v.toLowerCase().includes(k))
  );
}
