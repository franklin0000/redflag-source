import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { Marker, NavigationControl, GeolocateControl } from 'react-map-gl/mapbox';
// eslint-disable-next-line no-unused-vars
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { uploadFlagMedia } from '../services/storageService';
import { getCurrentLocation } from '../services/locationService';
import { supabase } from '../services/supabase';
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
    const [newFlagType, setNewFlagType] = useState('red');
    const [newFlagComment, setNewFlagComment] = useState('');
    const [flagMediaFiles, setFlagMediaFiles] = useState([]);
    const [isUploading, setIsUploading] = useState(false);

    const mapRef = useRef();

    // Load flags + subscribe to real-time via Supabase
    useEffect(() => {
        let isMounted = true;

        supabase.from('location_flags').select('*').order('created_at', { ascending: false })
            .then(({ data }) => { if (isMounted) setFlags(data || []); })
            .catch(err => console.error('Error fetching flags:', err));

        const channel = supabase.channel('location_flags_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'location_flags' }, (payload) => {
                if (isMounted) {
                    setFlags(prev => [payload.new, ...prev]);
                    toast.success(`A new ${payload.new.flag_type} flag was dropped!`);
                }
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
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
        if (!selectedPlace || (!newFlagComment.trim() && flagMediaFiles.length === 0)) return;
        setIsUploading(true);
        try {
            const uploadedMedia = [];
            if (flagMediaFiles.length > 0) {
                toast.info('Uploading media...');
                for (const file of flagMediaFiles) {
                    const url = await uploadFlagMedia(file, user.id);
                    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'document';
                    uploadedMedia.push({ url, type, name: file.name });
                }
            }
            const { error } = await supabase.from('location_flags').insert({
                place_id: selectedPlace.place_id,
                place_name: selectedPlace.name,
                lat: selectedPlace.lat,
                lng: selectedPlace.lng,
                flag_type: newFlagType,
                comment: newFlagComment,
                media: uploadedMedia,
                user_id: user?.id,
            });
            if (error) throw error;
            toast.success('Flag dropped successfully!');
            setIsAddingFlag(false); setNewFlagComment(''); setFlagMediaFiles([]); setSelectedPlace(null);
        } catch (err) {
            toast.error('Failed to drop flag.');
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDeleteFlag = async (flag) => {
        try {
            const { error } = await supabase.from('location_flags').delete().eq('id', flag.id);
            if (error) throw error;
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
                        <input type="text" placeholder="Find a place to review..." value={searchQuery}
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
                        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl pointer-events-auto mx-auto max-w-lg">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h2 className="text-2xl font-bold text-white leading-tight">{selectedPlace.name}</h2>
                                    <p className="text-gray-400 text-sm mt-1">Found via Mapbox</p>
                                </div>
                                <button onClick={() => setSelectedPlace(null)} className="p-2 bg-white/5 rounded-full hover:bg-white/10">
                                    <span className="material-icons text-gray-400">close</span>
                                </button>
                            </div>
                            <button onClick={() => setIsAddingFlag(true)}
                                className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-[0_0_20px_rgba(212,17,180,0.4)] flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                <span className="material-icons">add_location</span> Drop a Flag Here
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
                        <div className="bg-gray-900 border-t border-white/10 rounded-t-[40px] p-6 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.5)] h-[80vh] flex flex-col">
                            <div className="w-12 h-1.5 bg-gray-700 rounded-full mx-auto mb-6"></div>
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Review Place</h2>
                                    <p className="text-gray-400 text-sm">{selectedPlace.name}</p>
                                </div>
                                <button onClick={() => setIsAddingFlag(false)} className="p-2 bg-gray-800 rounded-full text-gray-400">
                                    <span className="material-icons">close</span>
                                </button>
                            </div>
                            <div className="flex gap-4 mb-6">
                                {['red', 'green'].map(type => (
                                    <button key={type} onClick={() => setNewFlagType(type)}
                                        className={`flex-1 py-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${newFlagType === type
                                            ? type === 'red' ? 'bg-red-900/40 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-green-900/40 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                                            : 'bg-gray-800 border-transparent text-gray-400'}`}
                                    >
                                        <span className={`material-icons text-3xl ${newFlagType === type ? (type === 'red' ? 'text-red-500' : 'text-green-500') : ''}`}>flag</span>
                                        <span className="font-bold">{type === 'red' ? 'Red Flag' : 'Green Flag'}</span>
                                    </button>
                                ))}
                            </div>
                            <textarea value={newFlagComment} onChange={(e) => setNewFlagComment(e.target.value)}
                                placeholder="Why are you giving this place a flag? What happened?"
                                className={`w-full flex-1 rounded-2xl p-4 bg-gray-800 border focus:outline-none resize-none text-white ${newFlagType === 'red' ? 'focus:border-red-500/50' : 'focus:border-green-500/50'} border-transparent`}
                            />
                            <div className="mt-4">
                                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                                    <span className="material-icons">attach_file</span> Add Photos, Audio, or Docs
                                    <input type="file" multiple accept="image/*,audio/*,.pdf,.doc,.docx" className="hidden"
                                        onChange={(e) => setFlagMediaFiles(prev => [...prev, ...Array.from(e.target.files)])}
                                    />
                                </label>
                                {flagMediaFiles.length > 0 && (
                                    <div className="mt-3 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                        {flagMediaFiles.map((f, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
                                                <span className="material-icons text-sm text-primary">{f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'audiotrack' : 'description'}</span>
                                                <span className="text-xs text-gray-300 truncate max-w-[100px]">{f.name}</span>
                                                <button onClick={() => setFlagMediaFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-500 hover:text-red-500 ml-1">
                                                    <span className="material-icons text-[14px]">close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={handleSubmitFlag}
                                disabled={(!newFlagComment.trim() && flagMediaFiles.length === 0) || isUploading}
                                className={`w-full py-4 mt-6 rounded-2xl font-bold transition-all ${((!newFlagComment.trim() && flagMediaFiles.length === 0) || isUploading) ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : newFlagType === 'red' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'}`}
                            >
                                {isUploading ? 'Uploading...' : 'Drop Flag'}
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
                        <div className={`mx-auto max-w-md rounded-3xl p-6 shadow-2xl pointer-events-auto border backdrop-blur-xl ${selectedFlag.flag_type === 'red' ? 'bg-red-950/90 border-red-500/30' : 'bg-green-950/90 border-green-500/30'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedFlag.flag_type === 'red' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                        <span className="material-icons">{selectedFlag.flag_type === 'red' ? 'warning' : 'verified'}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-white">{selectedFlag.place_name}</h3>
                                        <p className="text-xs text-gray-300">
                                            {selectedFlag.flag_type === 'red' ? 'Reported Red Flag' : 'Reported Green Flag'} • {new Date(selectedFlag.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFlag(null)} className="p-1 bg-black/20 rounded-full hover:bg-black/40">
                                    <span className="material-icons text-white/70">close</span>
                                </button>
                            </div>
                            <div className="bg-black/30 rounded-2xl p-4 border border-white/5 max-h-60 overflow-y-auto no-scrollbar">
                                <p className="text-white text-sm whitespace-pre-wrap">{selectedFlag.comment}</p>
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
