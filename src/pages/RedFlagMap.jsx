import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { locationFlagsApi, uploadFile } from '../services/api';
import { getCurrentLocation } from '../services/locationService';
import { getSocket } from '../services/socketService';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export default function RedFlagMap() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();

    const [viewState, setViewState] = useState({ longitude: -74.0060, latitude: 40.7128, zoom: 12, pitch: 45, bearing: 0 });
    const [flags, setFlags] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedPlace, setSelectedPlace] = useState(null);
    const [selectedFlag, setSelectedFlag] = useState(null);
    const [isAddingFlag, setIsAddingFlag] = useState(false);
    const [personName, setPersonName] = useState('');
    const [personPlatform, setPersonPlatform] = useState('');
    const [personCategory, setPersonCategory] = useState('Fake Profile');
    const [newFlagComment, setNewFlagComment] = useState('');
    const [flagMediaFiles, setFlagMediaFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    const PLATFORMS = ['Tinder', 'Bumble', 'Hinge', 'Instagram', 'Facebook', 'WhatsApp', 'Grindr', 'Other'];
    const CATEGORIES = ['Fake Profile', 'Catfishing', 'Scammer', 'Harassment', 'Infidelity', 'Violence', 'Other'];

    const mapRef = useRef();

    // Load flags + subscribe to real-time via Supabase
    useEffect(() => {
        let isMounted = true;

        locationFlagsApi.getAll(40.7128, -74.0060, 50)
            .then(data => { if (isMounted) setFlags(data || []); })
            .catch(err => console.error('Error fetching flags:', err));

        const socket = getSocket();
        const onNewFlag = (flag) => {
            if (isMounted) {
                setFlags(prev => [flag, ...prev]);
                toast.success(`A new ${flag.flag_type} flag was dropped!`);
            }
        };
        socket?.on('map:new_flag', onNewFlag);

        return () => {
            isMounted = false;
            socket?.off('map:new_flag', onNewFlag);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Mapbox geocoding search
    useEffect(() => {
        if (!searchQuery || !MAPBOX_TOKEN) { setSearchResults([]); return; }
        const timer = setTimeout(async () => {
            try {
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?types=place,region,country,address,poi&access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
                const data = await fetch(url).then(r => r.json());
                setSearchResults((data.features || []).map(f => ({
                    place_id: f.id, name: f.text, full_name: f.place_name,
                    lat: f.center[1], lng: f.center[0],
                })));
            } catch { setSearchResults([]); }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSelectResult = ({ lat, lng, name, place_id }) => {
        mapRef.current?.flyTo({ center: [lng, lat], zoom: 16, pitch: 60, duration: 1500 });
        setSelectedPlace({ place_id, name, lat, lng });
        setSearchQuery(''); setSearchResults([]); setSelectedFlag(null);
    };

    const handleSubmitFlag = async () => {
        if (!selectedPlace || !personName.trim()) return;
        setIsUploading(true);
        try {
            const uploadedMedia = [];
            if (flagMediaFiles.length > 0) {
                toast.info('Uploading evidence...');
                for (const file of flagMediaFiles) {
                    const url = await uploadFile(file, 'flags');
                    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'document';
                    uploadedMedia.push({ url, type, name: file.name });
                }
            }
            const comment = `PLATFORM:${personPlatform || 'Unknown'}\nCATEGORY:${personCategory}\n\n${newFlagComment}`;
            await locationFlagsApi.create({
                place_id: selectedPlace.place_id,
                place_name: personName.trim(),
                lat: selectedPlace.lat,
                lng: selectedPlace.lng,
                flag_type: 'red',
                comment,
                media: uploadedMedia,
            });
            toast.success('RedFlag submitted anonymously! 🔒');
            setIsAddingFlag(false);
            setPersonName(''); setPersonPlatform(''); setPersonCategory('Fake Profile');
            setNewFlagComment(''); setFlagMediaFiles([]); setSelectedPlace(null);
        } catch (err) {
            toast.error('Failed to submit RedFlag.');
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteFlag = async (flag) => {
        try {
            await locationFlagsApi.remove(flag.id);
            setFlags(prev => prev.filter(f => f.id !== flag.id));
            setSelectedFlag(null);
            toast.success('Flag removed');
        } catch (err) {
            toast.error('Failed to delete flag');
            console.error(err);
        }
    };

    return (
        <div className="w-full h-screen relative bg-black font-display overflow-hidden">
            <Map
                ref={mapRef}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                onClick={(evt) => {
                    if (evt.defaultPrevented) return;
                    const { lng, lat } = evt.lngLat;
                    setSelectedPlace({ place_id: `custom-${Date.now()}`, name: 'Pinned Location', lat, lng });
                    setSelectedFlag(null); setIsAddingFlag(false);
                    mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 });
                }}
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/dark-v11"
                mapboxAccessToken={MAPBOX_TOKEN}
                onLoad={() => {
                    getCurrentLocation()
                        .then(loc => mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 13, duration: 1500 }))
                        .catch(() => { });
                }}
            >
                <GeolocateControl position="bottom-right" className="mb-24 mr-2" />
                <NavigationControl position="bottom-right" className="mb-36 mr-2" />

                {flags.map(flag => (
                    <Marker key={flag.id} longitude={Number(flag.lng)} latitude={Number(flag.lat)} anchor="bottom"
                        onClick={(e) => {
                            e.originalEvent.stopPropagation();
                            setSelectedFlag(flag); setSelectedPlace(null); setIsAddingFlag(false);
                            mapRef.current?.flyTo({ center: [Number(flag.lng), Number(flag.lat)], zoom: 15, duration: 1000 });
                        }}
                    >
                        <div className="relative group cursor-pointer">
                            <div className={`absolute -inset-4 rounded-full blur-md opacity-40 group-hover:opacity-100 transition-opacity animate-pulse ${flag.flag_type === 'red' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                            <div className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center shadow-lg relative ${flag.flag_type === 'red' ? 'bg-red-600' : 'bg-green-500'}`}>
                                <span className="material-icons text-white text-sm">{flag.flag_type === 'red' ? 'warning' : 'verified'}</span>
                            </div>
                        </div>
                    </Marker>
                ))}

                {selectedPlace && !isAddingFlag && (
                    <Marker longitude={selectedPlace.lng} latitude={selectedPlace.lat} anchor="bottom">
                        <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center shadow-2xl animate-bounce">
                            <span className="material-icons text-white text-sm">place</span>
                        </div>
                    </Marker>
                )}
            </Map>

            {/* Top Search Bar */}
            <div className="absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4 pt-6 pointer-events-none">
                <div className="flex gap-3 pointer-events-auto">
                    <button onClick={() => navigate(-1)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-md shadow-lg transition-colors border border-white/5">
                        <span className="material-icons text-white">arrow_back</span>
                    </button>
                    <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-4 flex items-center text-gray-400"><span className="material-icons">search</span></span>
                        <input type="text" placeholder="Search where you met this person..." value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary shadow-2xl"
                        />
                        <AnimatePresence>
                            {searchResults.length > 0 && (
                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full lg:left-0 right-0 mt-2 bg-gray-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-60 overflow-y-auto z-20"
                                >
                                    {searchResults.map(r => (
                                        <button key={r.place_id} onClick={() => handleSelectResult(r)}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors flex items-center gap-3"
                                        >
                                            <span className="material-icons text-gray-500">place</span>
                                            <div>
                                                <div className="font-bold text-white text-sm truncate">{r.name}</div>
                                                <div className="text-xs text-gray-400 truncate">{r.full_name}</div>
                                            </div>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Selected Place Bottom Sheet */}
            <AnimatePresence>
                {selectedPlace && !isAddingFlag && (
                    <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
                        className="absolute bottom-0 inset-x-0 z-10 p-4 pointer-events-none"
                    >
                        <div className="bg-gray-900/95 backdrop-blur-xl border border-red-500/20 rounded-3xl p-6 shadow-2xl pointer-events-auto mx-auto max-w-lg">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-[11px] text-gray-400 uppercase tracking-widest mb-1">📍 Location selected</p>
                                    <h2 className="text-lg font-bold text-white leading-tight">{selectedPlace.name}</h2>
                                </div>
                                <button onClick={() => setSelectedPlace(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10">
                                    <span className="material-icons text-gray-400">close</span>
                                </button>
                            </div>
                            <button onClick={() => setIsAddingFlag(true)}
                                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                <span className="material-icons">person_off</span> RedFlag a Person Here
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add Flag Sheet */}
            <AnimatePresence>
                {isAddingFlag && selectedPlace && (
                    <motion.div initial={{ opacity: 0, y: '100%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: '100%' }}
                        className="absolute inset-0 z-50 bg-black/50 backdrop-blur-md flex flex-col justify-end"
                    >
                        <div className="bg-gray-900 border-t border-red-500/20 rounded-t-[40px] p-6 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] h-[90vh] flex flex-col overflow-y-auto">
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-6 flex-shrink-0"></div>
                            <div className="flex items-center justify-between mb-5 flex-shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                                        <span className="material-icons text-red-500">person_off</span> RedFlag a Person
                                    </h2>
                                    <p className="text-gray-400 text-xs mt-1">📍 {selectedPlace.name} · 🔒 Anonymous</p>
                                </div>
                                <button onClick={() => setIsAddingFlag(false)} className="p-2 bg-gray-800 rounded-full text-gray-400">
                                    <span className="material-icons">close</span>
                                </button>
                            </div>

                            {/* Person Name */}
                            <div className="mb-4">
                                <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Person's Name *</label>
                                <div className="relative">
                                    <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">person</span>
                                    <input
                                        value={personName}
                                        onChange={e => setPersonName(e.target.value)}
                                        placeholder="e.g. John Doe"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Platform */}
                            <div className="mb-4">
                                <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Platform / App</label>
                                <div className="flex gap-2 flex-wrap">
                                    {PLATFORMS.map(p => (
                                        <button key={p} onClick={() => setPersonPlatform(p)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${personPlatform === p ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-800 border-white/10 text-gray-400 hover:border-white/30'}`}
                                        >{p}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Category */}
                            <div className="mb-4">
                                <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Type of RedFlag</label>
                                <div className="flex gap-2 flex-wrap">
                                    {CATEGORIES.map(c => (
                                        <button key={c} onClick={() => setPersonCategory(c)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${personCategory === c ? 'bg-red-600 border-red-500 text-white' : 'bg-gray-800 border-white/10 text-gray-400 hover:border-white/30'}`}
                                        >{c}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="mb-4 flex-1">
                                <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">What happened?</label>
                                <textarea value={newFlagComment} onChange={e => setNewFlagComment(e.target.value)}
                                    placeholder="Describe the situation so others can stay safe..."
                                    rows={4}
                                    className="w-full rounded-xl p-4 bg-gray-800 border border-white/10 focus:outline-none focus:border-red-500/50 resize-none text-white text-sm placeholder-gray-500"
                                />
                            </div>

                            {/* Evidence */}
                            <div className="mb-5">
                                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                                    <span className="material-icons text-lg">add_a_photo</span> Add Evidence Photos
                                    <input type="file" multiple accept="image/*" className="hidden"
                                        onChange={e => setFlagMediaFiles(prev => [...prev, ...Array.from(e.target.files)])}
                                    />
                                </label>
                                {flagMediaFiles.length > 0 && (
                                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                                        {flagMediaFiles.map((f, i) => (
                                            <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                                                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                                                <button onClick={() => setFlagMediaFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                    className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5">
                                                    <span className="material-icons text-white text-[12px]">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button onClick={handleSubmitFlag}
                                disabled={!personName.trim() || isUploading}
                                className="w-full py-4 rounded-2xl font-bold transition-all flex-shrink-0 flex items-center justify-center gap-2 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30"
                            >
                                <span className="material-icons">flag</span>
                                {isUploading ? 'Uploading...' : 'Submit RedFlag Anonymously'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Flag Detail Sheet */}
            <AnimatePresence>
                {selectedFlag && (
                    <motion.div initial={{ opacity: 0, scale: 0.9, y: 50 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 50 }}
                        className="absolute bottom-6 inset-x-4 z-10 pointer-events-none"
                    >
                        <div className="mx-auto max-w-md rounded-3xl p-6 shadow-2xl pointer-events-auto border backdrop-blur-xl bg-red-950/90 border-red-500/30">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <span className="material-icons text-red-500">person_off</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{selectedFlag.place_name}</h3>
                                        {(() => {
                                            const lines = (selectedFlag.comment || '').split('\n');
                                            const platform = lines[0]?.replace('PLATFORM:', '').trim();
                                            const category = lines[1]?.replace('CATEGORY:', '').trim();
                                            return (
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    {platform && <span className="text-[10px] bg-gray-700 text-gray-300 rounded-full px-2 py-0.5">{platform}</span>}
                                                    {category && <span className="text-[10px] bg-red-900/50 text-red-400 border border-red-500/20 rounded-full px-2 py-0.5">{category}</span>}
                                                    <span className="text-[10px] text-gray-500">{new Date(selectedFlag.created_at).toLocaleDateString()}</span>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFlag(null)} className="p-1 bg-black/20 rounded-full hover:bg-black/40">
                                    <span className="material-icons text-white/70">close</span>
                                </button>
                            </div>
                            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 max-h-60 overflow-y-auto no-scrollbar">
                                <p className="text-white text-sm whitespace-pre-wrap">{
                                    (selectedFlag.comment || '').split('\n').slice(3).join('\n').trim() || (selectedFlag.comment || '')
                                }</p>
                                {selectedFlag.media && selectedFlag.media.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        <div className="h-px bg-white/10 w-full mb-3"></div>
                                        {selectedFlag.media.map((file, i) => (
                                            <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                                {file.type === 'image' && <img src={file.url} alt="Evidence" className="w-full h-auto object-cover max-h-[200px]" />}
                                                {file.type === 'audio' && <audio src={file.url} controls className="w-full h-10 p-2" />}
                                                {file.type === 'document' && (
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 hover:bg-white/5 transition-colors">
                                                        <span className="material-icons text-primary text-xl">description</span>
                                                        <span className="text-sm text-blue-400 hover:underline flex-1 truncate">{file.name}</span>
                                                        <span className="material-icons text-gray-500 text-sm">open_in_new</span>
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {user?.id === selectedFlag.user_id && (
                                <button onClick={() => handleDeleteFlag(selectedFlag)}
                                    className="mt-4 w-full py-2 bg-black/40 hover:bg-red-600/50 rounded-xl text-xs font-bold text-white transition-colors"
                                >
                                    Delete my flag
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
