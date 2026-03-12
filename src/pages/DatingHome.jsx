import React, { useState, useEffect } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { useDating } from '../context/DatingContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import Confetti from 'react-confetti';
import AdComponent from '../components/AdComponent';
import LocationSearchModal from '../components/Dating/LocationSearchModal';

export default function DatingHome() {
    const { potentialMatches, fetchMatches, swipeProfile, loading, isDatingMode, toggleMode } = useDating();
    const toast = useToast();
    const navigate = useNavigate();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [ghostMode, setGhostMode] = useState(false);
    const [searchMode, setSearchMode] = useState('local'); // 'local' or 'global'
    const [searchLocationName, setSearchLocationName] = useState('My Location');
    const [customCoords, setCustomCoords] = useState({ lat: null, lng: null });
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

    const [revealPhoto, setRevealPhoto] = useState(false);
    const [showMatchOverlay, setShowMatchOverlay] = useState(false);
    const [matchedProfile, setMatchedProfile] = useState(null);
    const [swipeDirection, setSwipeDirection] = useState(null);
    const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    useEffect(() => {
        // Auto-detect user location and reverse geocode city name
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const { latitude, longitude } = pos.coords;
                    setCustomCoords({ lat: latitude, lng: longitude });
                    fetchMatches('local', latitude, longitude);
                    try {
                        const token = import.meta.env.VITE_MAPBOX_TOKEN;
                        if (token) {
                            const res = await fetch(
                                `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=place&access_token=${token}`
                            );
                            const data = await res.json();
                            const city = data.features?.[0]?.text || data.features?.[0]?.place_name?.split(',')[0];
                            if (city) setSearchLocationName(city);
                        }
                    } catch {
                        // Keep default label if geocoding fails
                    }
                },
                () => {
                    // Permission denied or unavailable — use server default
                    fetchMatches(searchMode, null, null);
                },
                { timeout: 8000, maximumAge: 60000 }
            );
        } else {
            fetchMatches(searchMode, customCoords.lat, customCoords.lng);
        }

        const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Reset revealPhoto when card changes by using the previous index ref
    const prevIndexRef = React.useRef(currentIndex);
    if (prevIndexRef.current !== currentIndex) {
        prevIndexRef.current = currentIndex;
        if (revealPhoto) setRevealPhoto(false);
    }

    const handleSwipe = async (direction) => {
        const profile = potentialMatches[currentIndex];
        if (!profile) return;

        setSwipeDirection(direction);

        // Optimistic UI update: wait for animation then move to next
        setTimeout(async () => {
            // Move to next card immediately for smoothness
            setCurrentIndex(prev => prev + 1);
            setSwipeDirection(null);

            // Backend call
            if (direction === 'right' || direction === 'superlike') {
                // Map superlike to right for backend compatibility if needed, or send true direction
                // Sending 'right' to be safe with DB constraints, or check if 'superlike' is allowed.
                // For now, treat as 'right' (Like) but with special UI.
                const backendDirection = 'right';
                const result = await swipeProfile(profile.id, backendDirection);

                if (result.isMatch) {
                    setMatchedProfile(profile);
                    setShowMatchOverlay(true);
                    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
                    toast.success("It's a Match! 🎉");
                }
            } else {
                await swipeProfile(profile.id, 'left');
            }
        }, 300);
    };

    if (loading) return <div className="h-screen flex items-center justify-center text-white">Finding safe matches...</div>;

    const currentProfile = potentialMatches[currentIndex];

    // Header Component
    const Header = () => (
        <div className="absolute top-0 left-0 w-full h-16 bg-transparent z-10 flex justify-between items-center px-4">
            <div className="flex gap-2">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 rounded-full bg-black/40 text-gray-400 hover:text-white border border-gray-600/30 backdrop-blur-md transition-colors"
                >
                    <span className="material-icons">arrow_back</span>
                </button>
                <button onClick={() => navigate('/dating/matches')} className="p-2 rounded-full bg-black/40 text-purple-400 border border-purple-500/30 backdrop-blur-md relative">
                    <span className="material-icons">forum</span>
                    {/* Show unread count if available */}
                    {/* <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white border-2 border-black">2</span> */}
                </button>
            </div>

            {/* Location pill — tap city name → modal; tap globe/pin → toggle local/global */}
            <div className="flex items-center bg-black/40 backdrop-blur-md rounded-full border border-purple-500/30 overflow-hidden">
                <button
                    onClick={() => setIsLocationModalOpen(true)}
                    className="flex items-center gap-1 pl-3 pr-2 py-1.5 hover:bg-white/10 transition-colors"
                >
                    <span className="material-icons text-purple-400 text-sm">location_on</span>
                    <span className="text-xs font-bold text-gray-200 tracking-wider truncate max-w-[90px]">
                        {searchMode === 'global' ? 'World' : searchLocationName}
                    </span>
                </button>
                <button
                    onClick={() => {
                        const newMode = searchMode === 'local' ? 'global' : 'local';
                        setSearchMode(newMode);
                        toast.info(newMode === 'global' ? '🌍 Global search' : '📍 Local search', { autoClose: 2000 });
                        if (newMode === 'local' && !customCoords.lat) setSearchLocationName('My Location');
                        fetchMatches(newMode, customCoords.lat, customCoords.lng);
                        setCurrentIndex(0);
                    }}
                    className={`pl-2 pr-3 py-1.5 border-l transition-colors ${searchMode === 'global' ? 'border-blue-500/50 text-blue-400 bg-blue-600/20' : 'border-gray-600/30 text-gray-400 hover:text-white'}`}
                    title={searchMode === 'global' ? 'Switch to Local' : 'Switch to Global'}
                    aria-label="Toggle search scope"
                >
                    <span className="material-icons text-sm">{searchMode === 'global' ? 'public' : 'near_me'}</span>
                </button>
            </div>

            {/* Utilities: Dating Mode + Guard + Ghost */}
            <div className="flex gap-1.5">
                <button
                    onClick={toggleMode}
                    className={`p-2 rounded-full transition-all flex items-center justify-center ${isDatingMode ? 'bg-dating-accent text-white animate-glow' : 'bg-black/40 text-gray-400 hover:text-white border border-gray-600/30'}`}
                    title={isDatingMode ? 'Dating Mode ON' : 'Dating Mode OFF'}
                    aria-label="Toggle Dating Mode"
                >
                    <span className={`material-icons text-sm ${isDatingMode ? 'animate-heart-pulse' : ''}`}>{isDatingMode ? 'favorite' : 'favorite_border'}</span>
                </button>
                <button
                    onClick={() => navigate('/dating/checkin')}
                    className="p-2 rounded-full bg-purple-600/20 text-purple-400 border border-purple-500/50 hover:bg-purple-600 hover:text-white transition-colors flex items-center justify-center"
                    title="Guardia Personal"
                >
                    <span className="material-icons text-sm">health_and_safety</span>
                </button>
                <button
                    onClick={() => {
                        setGhostMode(!ghostMode);
                        toast.success(ghostMode ? "Ghost Mode OFF: You are visible" : "Ghost Mode ON: You are hidden 👻");
                    }}
                    className={`p-2 rounded-full transition-colors flex items-center justify-center ${ghostMode ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)]' : 'bg-black/40 text-gray-400 hover:text-white'}`}
                >
                    <span className="material-icons text-sm">{ghostMode ? 'visibility_off' : 'visibility'}</span>
                </button>
            </div>
        </div>
    );

    if (!currentProfile) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center relative">
                <Header />
                <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                    <span className="material-icons text-4xl text-purple-500">radar</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">No more profiles</h2>
                <p className="text-gray-400 text-sm mb-6">Try switching to Global search or change your location</p>
                <button
                    onClick={() => { fetchMatches(searchMode, customCoords.lat, customCoords.lng); setCurrentIndex(0); }}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold shadow-lg"
                >
                    Search Again
                </button>
                <LocationSearchModal
                    isOpen={isLocationModalOpen}
                    onClose={() => setIsLocationModalOpen(false)}
                    onLocationSelect={(lat, lng, cityName) => {
                        setCustomCoords({ lat, lng });
                        setSearchLocationName(cityName);
                        if (searchMode === 'global') {
                            setSearchMode('local');
                            toast.success(`Flying to ${cityName}... ✈️`);
                        } else {
                            toast.success(`Location set to ${cityName}`);
                        }
                        setCurrentIndex(0);
                        fetchMatches('local', lat, lng);
                    }}
                />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen bg-gray-900 overflow-hidden flex flex-col pt-16 pb-20 relative"
        >
            {/* Match Overlay */}
            <AnimatePresence>
                {showMatchOverlay && matchedProfile && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-6"
                    >
                        <div className="absolute inset-0 pointer-events-none">
                            <Confetti width={windowSize.width} height={windowSize.height} recycle={false} numberOfPieces={500} />
                        </div>
                        <motion.h1
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-8 italic transform -rotate-6 relative z-[102]"
                        >
                            IT'S A MATCH!
                        </motion.h1>
                        <div className="relative w-full max-w-sm h-64 mb-10 z-[102]">
                            <motion.div
                                initial={{ x: -100, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="absolute left-4 w-32 h-32 rounded-full border-4 border-purple-500 overflow-hidden shadow-[0_0_20px_rgba(168,85,247,0.5)] transform -rotate-12"
                            >
                                <img src={matchedProfile.photos?.[0] || ''} alt="Match" className="w-full h-full object-cover" />
                            </motion.div>
                            <motion.div
                                initial={{ x: 100, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                className="absolute right-4 w-32 h-32 rounded-full border-4 border-pink-500 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.5)] transform rotate-12 bg-gray-800 flex items-center justify-center"
                            >
                                <span className="material-icons text-4xl text-gray-500">person</span>
                            </motion.div>
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.5, type: "spring" }}
                                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg transform rotate-0 z-10"
                            >
                                <span className="material-icons text-purple-600 text-3xl">favorite</span>
                            </motion.div>
                        </div>
                        <div className="flex flex-col gap-3 w-full max-w-xs z-[102]">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/dating/chat/${matchedProfile.id}`);
                                }}
                                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-bold text-white shadow-lg text-lg cursor-pointer hover:shadow-xl active:scale-95 transition-all"
                                style={{ pointerEvents: 'auto', position: 'relative', zIndex: 103 }}
                            >
                                SEND MESSAGE
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMatchOverlay(false);
                                }}
                                className="w-full py-4 bg-gray-800 rounded-full font-bold text-gray-300 border border-gray-700 hover:bg-gray-700 cursor-pointer hover:shadow-xl active:scale-95 transition-all"
                                style={{ pointerEvents: 'auto', position: 'relative', zIndex: 103 }}
                            >
                                KEEP SWIPING
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header / Mode Indicator */}
            <Header />

            {/* Main Card Area */}
            <div className="flex-1 px-4 py-4 flex items-center justify-center">
                <div className="relative w-full max-w-sm aspect-[3/4]">
                    {/* Next card preview (stacked behind) */}
                    {potentialMatches[currentIndex + 1] && (
                        <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-lg border border-gray-800 scale-[0.95] -translate-y-2 opacity-50 pointer-events-none transition-all duration-300">
                            <img
                                src={potentialMatches[currentIndex + 1].photos?.[0] || ''}
                                alt="Next"
                                className="w-full h-full object-cover blur-sm"
                            />
                            <div className="absolute inset-0 bg-black/40" />
                        </div>
                    )}

                    {/* Current card with swipe animation */}
                    <div
                        className={`relative w-full h-full rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-gray-800 transition-all duration-300 ease-out ${swipeDirection === 'right' ? 'translate-x-[120%] rotate-12 opacity-0' :
                            swipeDirection === 'left' ? '-translate-x-[120%] -rotate-12 opacity-0' :
                                swipeDirection === 'superlike' ? '-translate-y-[120%] scale-110 opacity-0' : ''
                            }`}
                    >
                        <img
                            src={currentProfile.photos?.[0] || ''}
                            alt={currentProfile.name}
                            className={`w-full h-full object-cover transition-all duration-500 ${!currentProfile.isVerified && !revealPhoto ? 'blur-xl scale-110' : ''}`}
                        />

                        {/* Safety Shield Overlay */}
                        {!currentProfile.isVerified && !revealPhoto && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-black/20 text-center p-6">
                                <span className="material-icons text-6xl text-yellow-500 mb-2 drop-shadow-lg">shield</span>
                                <h3 className="text-xl font-bold text-white mb-1 drop-shadow-md">Unverified Profile</h3>
                                <p className="text-xs text-gray-200 mb-4 drop-shadow-md">Photo blurred for your safety. Review Trust Score before revealing.</p>
                                <button
                                    onClick={() => setRevealPhoto(true)}
                                    className="px-6 py-2 bg-black/60 backdrop-blur-md border border-white/30 rounded-full text-white text-sm font-bold hover:bg-white/20 transition-colors"
                                >
                                    Tap to Reveal
                                </button>
                            </div>
                        )}

                        {/* Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90 pointer-events-none"></div>

                        {/* Safety Badge */}
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-green-500/50 flex items-center gap-2 z-10">
                            <div className="relative">
                                <span className="material-icons text-green-500 text-sm">shield</span>
                                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            </div>
                            <div className="flex flex-col leading-none">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Trust Score</span>
                                <span className="text-sm font-bold text-white">{currentProfile.safety_score ?? currentProfile.safetyScore ?? 50}%</span>
                            </div>
                        </div>

                        {/* Verified Badge */}
                        <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                            {currentProfile.isVerified && (
                                <div className="bg-blue-600/90 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 shadow-lg shadow-blue-900/50">
                                    <span className="material-icons text-white text-[14px]">verified</span>
                                    <span className="text-[10px] font-bold text-white tracking-wide">FACE CHECKED</span>
                                </div>
                            )}
                            {(currentProfile.isVerifiedWeb3 || currentProfile.isWeb3Verified) && (
                                <div className="bg-purple-600/90 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 shadow-lg shadow-purple-900/50">
                                    <span className="material-icons text-white text-[14px]">hexagon</span>
                                    <span className="text-[10px] font-bold text-white tracking-wide">ON-CHAIN</span>
                                </div>
                            )}
                        </div>

                        {/* View Profile Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/profile/${currentProfile.id}`);
                            }}
                            className="absolute top-4 right-16 z-20 p-2 rounded-full bg-black/40 backdrop-blur-md text-white border border-white/20 hover:bg-white/10 transition-colors"
                        >
                            <span className="material-icons text-sm">info</span>
                        </button>

                        {/* Profile Info */}
                        <div className="absolute bottom-0 left-0 w-full p-6 text-white z-10">
                            <div className="flex items-end gap-2 mb-2">
                                <h2 className="text-3xl font-bold">{currentProfile.name}</h2>
                                <span className="text-2xl font-light text-gray-300">{currentProfile.age}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300 mb-4">
                                <span className="material-icons text-xs">location_on</span>
                                <span>{currentProfile.location || currentProfile.distance || 'Unknown location'}</span>
                            </div>
                            <p className="text-gray-200 text-sm line-clamp-2">{currentProfile.bio}</p>

                            {/* Compatibility Score & Interests */}
                            <div className="mt-3">
                                {currentProfile.compatibility && (
                                    <div className="mb-2">
                                        <div className="flex justify-between text-xs font-bold mb-1">
                                            <span className="text-purple-300">Compatibility</span>
                                            <span className="text-white">{currentProfile.compatibility}%</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                                style={{ width: `${currentProfile.compatibility}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-1.5">
                                    {(currentProfile.interests || []).map((interest, i) => {
                                        const isShared = (currentProfile.sharedInterests || []).includes(interest);
                                        return (
                                            <span
                                                key={i}
                                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${isShared
                                                    ? 'bg-purple-500/30 text-purple-200 border-purple-500/50'
                                                    : 'bg-black/40 text-gray-400 border-white/10'}`}
                                            >
                                                {interest}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        {/* Close the animated card wrapper */}
                    </div>

                    {/* Swipe direction indicators */}
                    {swipeDirection === 'right' && (
                        <div className="absolute top-8 left-8 z-30 bg-green-500/90 text-white px-4 py-2 rounded-lg text-xl font-black rotate-[-20deg] border-2 border-white/50 shadow-lg">
                            LIKE ❤️
                        </div>
                    )}
                    {swipeDirection === 'left' && (
                        <div className="absolute top-8 right-8 z-30 bg-red-500/90 text-white px-4 py-2 rounded-lg text-xl font-black rotate-[20deg] border-2 border-white/50 shadow-lg">
                            NOPE ✕
                        </div>
                    )}
                    {swipeDirection === 'superlike' && (
                        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 bg-blue-500/90 text-white px-4 py-2 rounded-lg text-xl font-black border-2 border-white/50 shadow-lg">
                            SUPER LIKE ⭐️
                        </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="h-24 px-6 flex items-center justify-center gap-6">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSwipe('left')}
                    className="w-14 h-14 rounded-full bg-gray-800 border border-red-500/30 text-red-500 flex items-center justify-center shadow-lg transition-colors hover:bg-red-500/10"
                >
                    <span className="material-icons text-3xl">close</span>
                </motion.button>

                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleSwipe('superlike')}
                    className="w-10 h-10 rounded-full bg-gray-800 text-blue-400 flex items-center justify-center shadow-lg transition-colors hover:bg-blue-400/10"
                >
                    <span className="material-icons text-xl">star</span>
                </motion.button>

                <motion.button
                    whileTap={{ scale: 0.9, rotate: -15 }}
                    onClick={() => handleSwipe('right')}
                    className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-purple-900/50 hover:shadow-purple-700/70 transition-shadow"
                >
                    <span className="material-icons text-3xl">favorite</span>
                </motion.button>
            </div>

            {/* Ad Space */}
            <div className="px-4 pb-2">
                <AdComponent slot="9482716350" style={{ display: 'block', maxHeight: '60px' }} />
            </div>

            {/* Passport Modal */}
            <LocationSearchModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
                onLocationSelect={(lat, lng, cityName) => {
                    setCustomCoords({ lat, lng });
                    setSearchLocationName(cityName);
                    // Force search mode to local if jumping to a new city's radius
                    if (searchMode === 'global') {
                        setSearchMode('local');
                        toast.success(`Flying to ${cityName}... ✈️`);
                    } else {
                        toast.success(`Location set to ${cityName}`);
                    }
                    setCurrentIndex(0);
                    fetchMatches('local', lat, lng);
                }}
            />
        </motion.div>
    );
}
