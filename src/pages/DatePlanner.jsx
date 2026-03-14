
import { useState, useEffect, useRef } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { placesService } from '../services/placesService';
import { getCurrentLocation } from '../services/locationService';
import { calendarService } from '../services/calendarService';
import { useToast } from '../context/ToastContext';
import { useDating } from '../context/DatingContext';
import { useAuth } from '../context/AuthContext';
import { sendMessage } from '../services/chatService';
import { safeRideService } from '../services/safeRideService';
import { datingApi, usersApi } from '../services/api';
import LocationSearchModal from '../components/Dating/LocationSearchModal';
import InteractiveMap from '../components/Dating/InteractiveMap';

export default function DatePlanner() {
    // matchId param now contains the partner's user UUID (passed from DatingChat as targetUserId)
    // Legacy: it may also be a composite uuid1_uuid2 — handle both
    const { matchId: rawParam } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { matches } = useDating();
    const { user } = useAuth();

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Extract the partner's user ID from the URL param
    // If it's a plain UUID → it IS the partner ID
    // If it's composite (uuid1_uuid2) → extract partner's UUID
    const targetUserId = rawParam && user
        ? (UUID_RE.test(rawParam)
            ? rawParam
            : rawParam.replace(new RegExp(`^${user.id}_|_${user.id}$`), ''))
        : null;

    // Find partner info from matches context
    const contextMatch = matches.find(m => m.id === targetUserId);

    // State for the real match UUID (from DB) — used for all API calls
    const [realMatchId, setRealMatchId] = useState(contextMatch?.match_id || null);
    // State for partner display info
    const [partnerInfo, setPartnerInfo] = useState(contextMatch || null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!targetUserId || !user?.id) return;

        // If context match has the data, use it immediately
        if (contextMatch?.match_id) {
            setRealMatchId(contextMatch.match_id);
            setPartnerInfo(contextMatch);
            return;
        }

        if (fetchedRef.current) return;
        fetchedRef.current = true;

        // Fetch real match UUID and partner info from API
        Promise.all([
            datingApi.getMatchWith(targetUserId).catch(() => null),
            usersApi.getUser(targetUserId).catch(() => null),
        ]).then(([matchData, userData]) => {
            if (matchData?.match_id) setRealMatchId(matchData.match_id);
            else if (user?.id && targetUserId) {
                // Fallback: composite (server resolveMatchId will handle it)
                setRealMatchId([user.id, targetUserId].sort().join('_'));
            }
            if (userData) {
                setPartnerInfo({ id: userData.id, name: userData.name, photo: userData.avatar_url, isVerified: userData.is_verified });
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetUserId, user?.id]);

    // Combine: use live context match if available (re-renders when matches loads)
    useEffect(() => {
        if (contextMatch?.match_id && !realMatchId) {
            setRealMatchId(contextMatch.match_id);
            setPartnerInfo(contextMatch);
        }
    }, [contextMatch, realMatchId]);

    // The match object used for display
    const match = partnerInfo || { id: targetUserId, name: 'Match', isVerified: false };

    const [loading, setLoading] = useState(true);
    const [places, setPlaces] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedVibe, setSelectedVibe] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmingPlace, setConfirmingPlace] = useState(null);

    // State for Location Passport
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const [searchLocationName, setSearchLocationName] = useState('My Location');
    const [customCoords, setCustomCoords] = useState(null);
    const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });
    const [gpsCoords, setGpsCoords] = useState(null);

    // UI State
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'map'

    // Get real GPS immediately on mount — separate from places fetch so map centers fast
    useEffect(() => {
        if (customCoords) return;
        getCurrentLocation()
            .then(loc => {
                setGpsCoords(loc);
                setMapCenter(loc);
            })
            .catch(() => {
                toast.warning('Location access denied. Using default area. Set your city with Location Passport.');
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Initial Load & Search handler
    useEffect(() => {
        let delayDebounceFn;

        const init = async () => {
            try {
                // 1. Use GPS (already fetched), custom passport coords, or NYC fallback
                const loc = customCoords || gpsCoords || { lat: 40.7128, lng: -74.0060 };

                // If there's a search query, geocode it to find coordinates
                let searchLoc = { ...loc };
                const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

                if (searchQuery && MAPBOX_TOKEN) {
                    try {
                        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?types=place,neighborhood,region,country,poi&access_token=${MAPBOX_TOKEN}&limit=1`;
                        const res = await fetch(url);
                        if (res.ok) {
                            const data = await res.json();
                            if (data.features && data.features.length > 0) {
                                searchLoc = {
                                    lat: data.features[0].center[1],
                                    lng: data.features[0].center[0]
                                };
                                if (!['poi'].includes(data.features[0].place_type[0])) {
                                    setMapCenter(searchLoc);
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Mapbox search error:", err);
                    }
                }

                // 2. Fetch Places
                // Map selected filters to API params
                // If selectedVibe is set, use it as keyword. If selectedCategory is not 'all', use it as type.
                const type = selectedCategory !== 'all' ? selectedCategory : 'point_of_interest';
                const keyword = searchQuery || selectedVibe || '';

                // Search around the newly found coordinates (searchLoc)
                const safePlaces = await placesService.searchSafePlaces(searchLoc.lat, searchLoc.lng, type, keyword);

                // If Mapbox found exactly one POI that Google missed, or if we want to ensure Google's
                setPlaces(safePlaces);
            } catch (error) {
                console.error("Error loading date planner:", error);
                toast.error("Could not load recommendations");
            } finally {
                setLoading(false);
            }
        };

        // Debounce the search if typing
        if (searchQuery) {
            setLoading(true);
            delayDebounceFn = setTimeout(init, 600);
        } else {
            init();
        }

        return () => clearTimeout(delayDebounceFn);
    }, [toast, selectedCategory, selectedVibe, searchQuery, customCoords, gpsCoords]);

    // Derived Data - vibes are handled server-side now

    // Filter Logic is now handled by API search, but we can do client-side refinement if needed.
    // For now, trust the API results.
    const filteredPlaces = places;

    // Handlers
    const handleConfirmDate = (place) => {
        setConfirmingPlace(place);
    };

    // Effective matchId for API calls — real UUID if resolved, else composite fallback
    const effectiveMatchId = realMatchId || (user?.id && targetUserId ? [user.id, targetUserId].sort().join('_') : null);

    const handleInvite = async () => {
        if (!effectiveMatchId) {
            toast.error("Match not found. Please go back and try again.");
            return;
        }
        try {
            await sendMessage(
                effectiveMatchId,
                `[date_invite] Let's meet at ${confirmingPlace.name}!📍 ${confirmingPlace.address}`
            );
            toast.success(`Invite to ${confirmingPlace.name} sent to ${match.name}!`);
        } catch (err) {
            console.error("Failed to send invite", err);
            toast.error(`Failed to send invite: ${err.message}`);
        }
        setConfirmingPlace(null);
        navigate(-1);
    };

    const handleShareSafe = () => {
        navigate('/dating/checkin', {
            state: {
                meetingPlace: confirmingPlace.name,
                meetingAddress: confirmingPlace.address,
                meetingCoordinates: { lat: confirmingPlace.lat, lng: confirmingPlace.lng },
                meetingProfile: {
                    name: match.name,
                    photo: match.photo,
                    id: match.id
                }
            }
        });
    };

    const handleLiveTrack = async () => {
        // Navigate first — the radar page uses socket for real-time, message is just a notification
        const navTarget = effectiveMatchId || targetUserId;
        if (!navTarget) { toast.error("Match not found."); return; }

        // Try to send notification message; navigate regardless
        sendMessage(
            effectiveMatchId,
            `[live_location_invite] I'm sharing my live location with you for our date!`
        ).catch(err => console.warn("Live track message failed (non-fatal):", err.message));

        toast.success(`Live Radar started!`);
        navigate(`/dating/live-radar/${navTarget}`);
    };

    const handleSafeRide = async () => {
        try {
            const sessionId = await safeRideService.requestRide(
                user.id,
                match.id || targetUserId,
                effectiveMatchId || targetUserId,
                confirmingPlace.name,
                confirmingPlace.address,
                confirmingPlace.lat,
                confirmingPlace.lng
            );

            // Try to notify partner — non-fatal if it fails
            if (effectiveMatchId) {
                sendMessage(
                    effectiveMatchId,
                    `[saferide_invite:${sessionId}] I've ordered a SafeRide for you to get to ${confirmingPlace.name}!`
                ).catch(err => console.warn("SafeRide message failed (non-fatal):", err.message));
            }

            toast.success(`SafeRide Sent!`);
            navigate(`/dating/saferide/${sessionId}`);
        } catch (err) {
            console.error("Failed to send SafeRide", err);
            toast.error(`Failed to send SafeRide: ${err.message}`);
        }
    };

    const handleAddToCalendar = (type) => {
        // Mock Date Time: Tomorrow at 7 PM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(19, 0, 0, 0);
        const endTime = new Date(tomorrow);
        endTime.setHours(21, 0, 0, 0);

        const event = {
            title: `Date with ${match.name}`,
            location: confirmingPlace.address,
            description: `Meeting at ${confirmingPlace.name}. Safety Check: Active.`,
            startTime: tomorrow,
            endTime: endTime
        };

        if (type === 'google') {
            window.open(calendarService.addToGoogleCalendar(event), '_blank');
        } else {
            calendarService.downloadICS(event);
        }
        toast.success("Added to Calendar");
    };

    // Initial loading handled gracefully below

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen pb-20 font-display relative">

            {/* Header */}
            <header className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-lg border-b border-gray-200 dark:border-white/5 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Plan Safe Date</h1>
                        <p className="text-xs text-gray-500">with {match.name}</p>
                    </div>
                </div>

                <button
                    onClick={() => setIsLocationModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                    <span className="material-icons text-primary text-sm">flight_takeoff</span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate max-w-[100px]">
                        {searchLocationName}
                    </span>
                </button>
            </header>

            {/* Verification Warning */}
            {!match.isVerified && (
                <div className="mx-4 mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-3 flex gap-3 text-start">
                    <span className="material-icons text-yellow-600 dark:text-yellow-500">warning</span>
                    <div>
                        <h3 className="font-bold text-yellow-800 dark:text-yellow-400 text-sm">Unverified Match</h3>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300/80 mt-1">
                            {match.name} hasn't verified their identity yet. Please stick to public places and enable your Personal Guard.
                        </p>
                    </div>
                </div>
            )}

            {/* Suggested for You (AI) */}
            <div className="px-4 mt-6 mb-2">
                <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-purple-600 animate-pulse">auto_awesome</span>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white">Suggested for You & {match.name}</h2>
                </div>
                <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-purple-500/20 rounded-2xl p-4 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                        <span className="material-icons text-6xl text-white">psychology</span>
                    </div>

                    <p className="text-xs text-gray-300 mb-3 relative z-10">
                        Based on your shared love for <span className="text-white font-bold">Coffee</span> and <span className="text-white font-bold">Nature</span>, our AI recommends:
                    </p>

                    <div className="flex gap-2 relative z-10 overflow-x-auto no-scrollbar">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setSelectedVibe('Coffee'); setSelectedCategory('cafe'); toast.success("Applied AI Filter: Coffee Date"); }}
                            className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 hover:bg-purple-600 hover:border-purple-500 transition-colors shrink-0"
                        >
                            <span className="text-lg">☕</span>
                            <div className="text-left">
                                <div className="text-[10px] text-gray-400 uppercase font-bold">Low Key</div>
                                <div className="text-xs font-bold text-white">Coffee Date</div>
                            </div>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setSelectedVibe('Outdoors'); setSelectedCategory('park'); toast.success("Applied AI Filter: Park Walk"); }}
                            className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 hover:bg-green-600 hover:border-green-500 transition-colors shrink-0"
                        >
                            <span className="text-lg">🌳</span>
                            <div className="text-left">
                                <div className="text-[10px] text-gray-400 uppercase font-bold">Active</div>
                                <div className="text-xs font-bold text-white">Park Walk</div>
                            </div>
                        </motion.button>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="px-4 mt-4">
                <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                        <span className="material-icons">search</span>
                    </span>
                    <input
                        type="text"
                        placeholder="Search places (e.g. Pizza, Central Park)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                    />
                </div>
            </div>

            {/* Smart Suggestions / Vibe Filter */}
            <div className="px-4 mt-4">
                <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2 ml-1">What's the vibe?</h2>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setSelectedVibe(null)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${!selectedVibe
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'bg-transparent border-gray-300 dark:border-gray-700 text-gray-500'
                            }`}
                    >
                        Any Vibe
                    </button>
                    {['Casual', 'First Date', 'Coffee', 'Romantic', 'Dinner', 'Lively', 'Quiet', 'Public Space', 'Study', 'Quick Meet', 'Outdoors'].map(vibe => (
                        <button
                            key={vibe}
                            onClick={() => setSelectedVibe(vibe === selectedVibe ? null : vibe)}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${selectedVibe === vibe
                                ? 'bg-purple-600 border-purple-600 text-white'
                                : 'bg-transparent border-gray-300 dark:border-gray-700 text-gray-500'
                                }`}
                        >
                            {vibe}
                        </button>
                    ))}
                </div>
            </div>

            {/* Category Filters */}
            <div className="flex items-center gap-2 px-4 py-4 overflow-x-auto no-scrollbar">
                {['all', 'cafe', 'restaurant', 'public'].map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat
                            ? 'bg-primary text-white shadow-lg shadow-primary/30'
                            : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10'
                            }`}
                    >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                ))}
            </div>

            {/* View Toggle */}
            <div className="px-4 mb-4 flex justify-end">
                <div className="flex bg-white dark:bg-white/5 p-1 rounded-full border border-gray-200 dark:border-white/10 shrink-0">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'list'
                            ? 'bg-primary text-white shadow-md'
                            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        <span className="material-icons text-sm">view_list</span>
                        List
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === 'map'
                            ? 'bg-primary text-white shadow-md'
                            : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
                            }`}
                    >
                        <span className="material-icons text-sm">map</span>
                        Map
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary border-r-transparent"></div>
                </div>
            ) : viewMode === 'list' && (
                <div className="px-4 space-y-4">
                    {filteredPlaces.map(place => (
                        <div key={place.id} className="bg-white dark:bg-[#2d1b2a] rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="h-32 w-full relative">
                                <img src={place.image} alt={place.name} className="w-full h-full object-cover" />
                                <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                                    <span className="material-icons text-[10px]">shield</span>
                                    {place.safetyScore}% SAFE
                                </div>
                            </div>
                            <div className="p-4">
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">{place.name}</h3>
                                    <div className="flex items-center gap-0.5 text-yellow-500">
                                        <span className="text-sm font-bold">{place.rating}</span>
                                        <span className="material-icons text-sm">star</span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{place.address} • {place.distance}km</p>

                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {(place.vibe || []).map((v, i) => (
                                        <span key={`v-${i}`} className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 text-[10px] font-bold border border-purple-200 dark:border-purple-800/30">
                                            {v}
                                        </span>
                                    ))}
                                    {place.features.map((feat, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-[10px] font-medium border border-gray-200 dark:border-white/5">
                                            {feat}
                                        </span>
                                    ))}
                                </div>

                                <button
                                    onClick={() => handleConfirmDate(place)}
                                    className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm shadow-md active:scale-95 transition-all"
                                >
                                    Select This Place
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {filteredPlaces.length === 0 && viewMode === 'list' && !loading && (
                <div className="text-center py-10 px-6">
                    <p className="text-gray-500">No safe places found. Try adjusting the vibe filters.</p>
                </div>
            )}

            {/* Map View */}
            {viewMode === 'map' && !loading && (
                <div className="px-4" style={{ height: '500px' }}>
                    <InteractiveMap
                        center={mapCenter}
                        places={filteredPlaces}
                        onPlaceSelect={handleConfirmDate}
                    />
                    {filteredPlaces.length === 0 && (
                        <p className="text-xs text-center text-gray-500 mt-2">No safe places found in this area to map.</p>
                    )}
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmingPlace && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-3xl p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600 dark:text-green-400">
                                <span className="material-icons text-3xl">check_circle</span>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Date?</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                                Meeting {match.name} at <br />
                                <span className="font-bold text-gray-800 dark:text-gray-200">{confirmingPlace.name}</span>
                            </p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={handleInvite}
                                className="w-full py-3 rounded-xl bg-primary text-white font-bold shadow-lg shadow-primary/30 active:scale-95 transition-transform flex items-center justify-center gap-2"
                            >
                                <span className="material-icons">send</span>
                                Send Invite
                            </button>

                            <button
                                onClick={handleSafeRide}
                                className="w-full py-3 bg-gradient-to-r from-gray-900 to-black dark:from-gray-800 dark:to-gray-950 text-white font-bold rounded-xl border border-gray-700 shadow-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-white">local_taxi</span>
                                Send SafeRide (Uber)
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleAddToCalendar('google')}
                                    className="py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-sm">calendar_today</span>
                                    Google Cal
                                </button>
                                <button
                                    onClick={() => handleAddToCalendar('ics')}
                                    className="py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-sm">download</span>
                                    Download
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleShareSafe}
                                    className="py-2.5 rounded-xl border-2 border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-sm">health_and_safety</span>
                                    Guard Mode
                                </button>
                                <button
                                    onClick={handleLiveTrack}
                                    className="py-2.5 rounded-xl bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <span className="material-icons text-sm">my_location</span>
                                    Live Radar
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setConfirmingPlace(null)}
                            className="w-full mt-4 text-gray-400 text-sm hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Passport Modal */}
            <LocationSearchModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
                onLocationSelect={(lat, lng, cityName) => {
                    setCustomCoords({ lat, lng });
                    setSearchLocationName(cityName);
                    setLoading(true);
                    toast.success(`Planning date in ${cityName}...`);
                }}
            />
        </div>
    );
}
