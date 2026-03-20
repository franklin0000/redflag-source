import { useState, useEffect, useRef } from 'react';
import Map, { Marker, Layer, NavigationControl } from 'react-map-gl/mapbox';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { locationFlagsApi } from '../../services/api';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_STYLE = 'mapbox://styles/mapbox/dark-v11';

const CATEGORIES = [
    { id: 'all',        emoji: '✨', label: 'All'       },
    { id: 'cafe',       emoji: '☕', label: 'Café'      },
    { id: 'restaurant', emoji: '🍽️', label: 'Dinner'    },
    { id: 'park',       emoji: '🌿', label: 'Parks'     },
    { id: 'bar',        emoji: '🍸', label: 'Bar'       },
    { id: 'cinema',     emoji: '🎬', label: 'Cinema'    },
    { id: 'museum',     emoji: '🏛️', label: 'Museum'    },
    { id: 'library',    emoji: '📚', label: 'Library'   },
    { id: 'public',     emoji: '🏙️', label: 'Public'    },
];

const TYPE_COLOR = {
    cafe:       '#f59e0b',
    restaurant: '#ef4444',
    park:       '#22c55e',
    bar:        '#8b5cf6',
    cinema:     '#3b82f6',
    museum:     '#06b6d4',
    library:    '#10b981',
    public:     '#d411b4',
};

const TYPE_EMOJI = {
    cafe: '☕', restaurant: '🍽️', park: '🌿', bar: '🍸',
    cinema: '🎬', museum: '🏛️', library: '📚', public: '🏙️',
};

// 3D buildings layer spec (uses composite source from dark-v11 style)
const BUILDINGS_LAYER = {
    id: '3d-buildings',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 15,
    paint: {
        'fill-extrusion-color': '#1a1a2e',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, ['get', 'height']],
        'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, ['get', 'min_height']],
        'fill-extrusion-opacity': 0.8,
    },
};

function getColor(type) { return TYPE_COLOR[type] || '#d411b4'; }
function getEmoji(type) { return TYPE_EMOJI[type] || '📍'; }

// First Date Score: safety + rating + type bonus
function calcFirstDateScore(place) {
    const safetyW  = (place.safetyScore || 80) * 0.4;
    const ratingW  = ((place.rating   || 3.5) / 5) * 100 * 0.35;
    const typeBonus = { cafe: 15, restaurant: 12, park: 10, cinema: 10, museum: 8, library: 6, bar: 3, public: 7 };
    const bonus    = typeBonus[place.type] || 5;
    return Math.min(99, Math.round(safetyW + ratingW + bonus));
}

function SafetyBar({ score }) {
    const pct   = Math.min(100, Math.max(0, score));
    const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const label = pct >= 80 ? 'Very Safe' : pct >= 60 ? 'Moderate' : 'Use Caution';
    return (
        <div>
            <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500">Safety Score</span>
                <span className="font-bold" style={{ color }}>{pct}/100 · {label}</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <motion.div
                    className="h-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                />
            </div>
        </div>
    );
}

export default function InteractiveMap({ center, places, onPlaceSelect }) {
    const mapRef = useRef(null);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [activeCategory, setActiveCategory] = useState('all');
    const [communityFlags, setCommunityFlags] = useState([]);
    const [showFlags, setShowFlags] = useState(true);
    const [viewState, setViewState] = useState({
        longitude: center?.lng || -74.0060,
        latitude:  center?.lat || 40.7128,
        zoom: 13,
        pitch: 45,
        bearing: -5,
    });

    // Fly to new center without calling setState inside the effect
    useEffect(() => {
        if (center && mapRef.current) {
            mapRef.current.flyTo({
                center:   [center.lng, center.lat],
                zoom:     14,
                pitch:    50,
                duration: 1200,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [center?.lat, center?.lng]);

    // Load community flags (read-only overlay)
    useEffect(() => {
        const lat = center?.lat || 40.7128;
        const lng = center?.lng || -74.0060;
        locationFlagsApi.getAll(lat, lng, 50)
            .then((data) => setCommunityFlags(data || []))
            .catch(() => setCommunityFlags([]));
    }, [center?.lat, center?.lng]);

    const visible = activeCategory === 'all'
        ? places
        : places.filter(p => p.type === activeCategory);

    const handleSelectPlace = (place) => {
        setSelectedPlace(place);
        mapRef.current?.flyTo({
            center:   [place.lng, place.lat],
            zoom:     17,
            pitch:    55,
            duration: 850,
        });
    };

    if (!MAPBOX_TOKEN) return (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white rounded-3xl border border-purple-500/20">
            <p className="text-gray-400 text-sm">Mapbox Token Missing in .env</p>
        </div>
    );

    return (
        <div className="w-full h-full relative overflow-hidden rounded-3xl border border-purple-500/20 shadow-[0_0_40px_rgba(212,17,180,0.12)]">
            {/* ── Map ── */}
            <Map
                ref={mapRef}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                mapStyle={MAPBOX_STYLE}
                mapboxAccessToken={MAPBOX_TOKEN}
                style={{ width: '100%', height: '100%' }}
                onLoad={e => {
                    // Premium fog/atmosphere effect
                    e.target.setFog({
                        range:            [1, 10],
                        color:            '#0a0a18',
                        'high-color':     '#1a1a38',
                        'space-color':    '#000005',
                        'horizon-blend':  0.3,
                    });
                }}
            >
                <NavigationControl position="top-right" visualizePitch showCompass />

                {/* 3D buildings */}
                <Layer {...BUILDINGS_LAYER} />

                {/* Community flags mini-dots */}
                {showFlags && communityFlags.map(flag => (
                    <Marker
                        key={flag.id}
                        longitude={Number(flag.lng)}
                        latitude={Number(flag.lat)}
                        anchor="center"
                    >
                        <div
                            title={`${flag.flag_type === 'red' ? '🚩' : '✅'} ${flag.place_name}`}
                            className={`w-2.5 h-2.5 rounded-full border border-white/40 shadow-sm cursor-default ${
                                flag.flag_type === 'red' ? 'bg-red-500' : 'bg-green-500'
                            }`}
                        />
                    </Marker>
                ))}

                {/* Place markers */}
                {visible.map(place => {
                    const sel   = selectedPlace?.id === place.id;
                    const hot   = (place.rating || 0) >= 4.5 && (place.reviews || 0) > 100;
                    const busy  = place.busyNow;
                    const color = getColor(place.type);

                    return (
                        <Marker
                            key={place.id}
                            longitude={place.lng}
                            latitude={place.lat}
                            anchor="center"
                            onClick={e => {
                                e.originalEvent.stopPropagation();
                                handleSelectPlace(place);
                            }}
                        >
                            <div
                                className="relative cursor-pointer select-none"
                                style={{
                                    transform:  sel ? 'scale(1.4)' : 'scale(1)',
                                    transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                                }}
                            >
                                {/* Hot badge */}
                                {hot && !sel && (
                                    <div className="absolute -top-2 -right-2 z-10 text-sm animate-bounce">🔥</div>
                                )}
                                {/* Busy badge */}
                                {busy && !hot && !sel && (
                                    <div className="absolute -top-1.5 -right-1.5 z-10 w-3 h-3 bg-orange-400 border border-white rounded-full animate-pulse" title="Busy now" />
                                )}

                                {/* Outer pulse ring (slower when not selected) */}
                                <div
                                    className="absolute -inset-3 rounded-full animate-ping opacity-15"
                                    style={{
                                        backgroundColor:  color,
                                        animationDuration: sel ? '0.9s' : '2.8s',
                                    }}
                                />
                                {/* Glow halo */}
                                <div
                                    className="absolute -inset-1.5 rounded-full opacity-20 blur-sm"
                                    style={{ backgroundColor: color }}
                                />
                                {/* Marker body */}
                                <div
                                    className="relative w-11 h-11 rounded-full flex items-center justify-center text-xl border-2 shadow-xl"
                                    style={{
                                        background:  `radial-gradient(circle at 35% 35%, ${color}55, ${color}22)`,
                                        borderColor: color,
                                        boxShadow:   `0 0 18px ${color}55, inset 0 1px 1px rgba(255,255,255,0.12)`,
                                    }}
                                >
                                    {getEmoji(place.type)}
                                </div>
                            </div>
                        </Marker>
                    );
                })}
            </Map>

            {/* ── Category Filter Bar ── */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-black/75 backdrop-blur-2xl border border-white/10 rounded-2xl p-1 shadow-2xl">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => { setActiveCategory(cat.id); setSelectedPlace(null); }}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                            activeCategory === cat.id
                                ? 'bg-primary text-white shadow-[0_0_14px_rgba(212,17,180,0.6)]'
                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                    >
                        <span>{cat.emoji}</span>
                        <span className="hidden sm:inline">{cat.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Community Flags Toggle ── */}
            <button
                onClick={() => setShowFlags(f => !f)}
                className={`absolute top-14 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all backdrop-blur-xl ${
                    showFlags
                        ? 'bg-red-950/70 border-red-500/40 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                        : 'bg-black/60 border-white/10 text-gray-500'
                }`}
            >
                🚩 <span className="hidden sm:inline">Community</span>
            </button>

            {/* ── Count Chip (shown when no card is open) ── */}
            <AnimatePresence>
                {visible.length > 0 && !selectedPlace && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16 }}
                        className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 bg-black/70 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 font-medium shadow-lg pointer-events-none"
                    >
                        {visible.length} safe venues nearby · tap to explore
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Bottom Sheet Detail Card ── */}
            <AnimatePresence>
                {selectedPlace && (
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className="absolute bottom-0 inset-x-0 z-20"
                    >
                        <div className="bg-gray-950/97 backdrop-blur-3xl border-t border-white/10 rounded-t-[2rem] shadow-[0_-24px_60px_rgba(0,0,0,0.7)] p-5 pb-7">
                            {/* Drag handle */}
                            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />

                            {/* Header row: photo + info */}
                            <div className="flex gap-4 mb-4">
                                {selectedPlace.image && (
                                    <img
                                        src={selectedPlace.image}
                                        alt={selectedPlace.name}
                                        className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-white/10 shadow-lg"
                                        onError={e => { e.target.style.display = 'none'; }}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-black text-white text-lg leading-tight">{selectedPlace.name}</h3>
                                        <button
                                            onClick={() => setSelectedPlace(null)}
                                            className="text-gray-600 hover:text-white transition-colors shrink-0 mt-0.5"
                                        >
                                            <span className="material-icons text-lg">close</span>
                                        </button>
                                    </div>

                                    {/* Badges row */}
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            selectedPlace.openNow
                                                ? 'bg-green-900/50 text-green-400 border border-green-500/30'
                                                : 'bg-red-900/50 text-red-400 border border-red-500/30'
                                        }`}>
                                            <span className="w-1.5 h-1.5 rounded-full bg-current inline-block animate-pulse" />
                                            {selectedPlace.openNow ? 'Open Now' : 'Closed'}
                                        </span>

                                        {selectedPlace.rating && (
                                            <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-500/20">
                                                ★ {selectedPlace.rating}
                                            </span>
                                        )}
                                        {selectedPlace.reviews && (
                                            <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                                                {selectedPlace.reviews} reviews
                                            </span>
                                        )}
                                        {selectedPlace.priceRange && (
                                            <span className="text-[10px] font-bold text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">
                                                {selectedPlace.priceRange}
                                            </span>
                                        )}
                                        {selectedPlace.busyNow && (
                                            <span className="text-[10px] font-bold text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full border border-orange-500/20 animate-pulse">
                                                🔥 Busy Now
                                            </span>
                                        )}
                                    </div>
                                    {/* Address + distance row */}
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <span className="material-icons text-gray-600 text-xs">place</span>
                                        <p className="text-xs text-gray-500 truncate flex-1">{selectedPlace.address}</p>
                                        {selectedPlace.distance != null && (
                                            <span className="text-[10px] text-primary font-bold shrink-0 bg-primary/10 px-1.5 py-0.5 rounded-full">
                                                {selectedPlace.distance} km
                                            </span>
                                        )}
                                    </div>

                                    {/* Hours row */}
                                    {selectedPlace.closingTime && selectedPlace.closingTime !== 'Check Details' && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className="material-icons text-gray-600 text-xs">schedule</span>
                                            <p className="text-[10px] text-gray-500 truncate">{selectedPlace.closingTime}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Phone + Website quick actions */}
                            {(selectedPlace.phone || selectedPlace.website) && (
                                <div className="flex gap-2 mb-4">
                                    {selectedPlace.phone && (
                                        <a href={`tel:${selectedPlace.phone}`}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-900/30 border border-green-500/20 rounded-xl text-green-400 text-xs font-bold hover:bg-green-900/50 transition-colors">
                                            <span className="material-icons text-sm">call</span>
                                            {selectedPlace.phone}
                                        </a>
                                    )}
                                    {selectedPlace.website && (
                                        <a href={selectedPlace.website} target="_blank" rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-900/30 border border-blue-500/20 rounded-xl text-blue-400 text-xs font-bold hover:bg-blue-900/50 transition-colors truncate">
                                            <span className="material-icons text-sm">language</span>
                                            Website
                                        </a>
                                    )}
                                </div>
                            )}

                            {/* Safety score bar */}
                            {selectedPlace.safetyScore !== undefined && (
                                <div className="mb-3">
                                    <SafetyBar score={selectedPlace.safetyScore} />
                                </div>
                            )}

                            {/* First Date Score */}
                            {(() => {
                                const fds = calcFirstDateScore(selectedPlace);
                                const color = fds >= 80 ? '#a855f7' : fds >= 60 ? '#f59e0b' : '#6b7280';
                                const label = fds >= 85 ? 'Perfect ✨' : fds >= 70 ? 'Great 👍' : fds >= 55 ? 'Decent' : 'Risky';
                                return (
                                    <div className="mb-4 bg-purple-950/40 border border-purple-500/20 rounded-xl px-3 py-2.5">
                                        <div className="flex justify-between items-center text-xs mb-1.5">
                                            <span className="text-gray-400 font-medium">💑 First Date Score</span>
                                            <span className="font-black text-sm" style={{ color }}>{fds}/99 · {label}</span>
                                        </div>
                                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="h-1.5 rounded-full transition-all duration-700"
                                                style={{ width: `${fds}%`, backgroundColor: color }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Vibe tags */}
                            {selectedPlace.vibe?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {selectedPlace.vibe.map(v => (
                                        <span key={v} className="text-[11px] font-semibold bg-purple-950/60 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                                            {v}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Feature chips — all of them */}
                            {selectedPlace.features?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-5">
                                    {selectedPlace.features.map(f => (
                                        <span key={f} className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/8">
                                            ✓ {f}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* CTAs */}
                            <div className="flex gap-2.5">
                                <button
                                    onClick={() => {
                                        if (onPlaceSelect) onPlaceSelect(selectedPlace);
                                        setSelectedPlace(null);
                                    }}
                                    className="flex-1 py-3.5 bg-gradient-to-r from-primary to-purple-600 text-white font-black rounded-2xl shadow-[0_0_24px_rgba(212,17,180,0.4)] text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-sm">event</span>
                                    Plan Date Here
                                </button>
                                <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.lat},${selectedPlace.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-3.5 bg-white/8 hover:bg-white/12 border border-white/10 text-white rounded-2xl font-bold transition-colors flex items-center justify-center"
                                    title="Get Directions"
                                >
                                    <span className="material-icons text-base">directions</span>
                                </a>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
