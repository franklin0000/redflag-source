
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { datingApi, usersApi, uploadFile } from '../services/api';
import { uploadToIPFS } from '../services/ipfsService';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';
import { checkNftOwnership } from '../services/web3';

export default function Management() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const toast = useToast();
    const [darkMode, setDarkMode] = useState(() => {
        const theme = localStorage.getItem('redflag_theme');
        return theme === null ? true : theme === 'dark';
    });

    // ── Media State ──
    const [photos, setPhotos] = useState([]);
    const [videos, setVideos] = useState([]);
    const [voiceNotes, setVoiceNotes] = useState([]);

    // ── Bio / About Me State ──
    const [aboutMe, setAboutMe] = useState({
        bio: '',
        age: '',
        location: '',
        occupation: '',
        height: '',
        zodiac: '',
    });
    const [interests, setInterests] = useState([]);
    const [lookingFor, setLookingFor] = useState({ type: '', ageRange: '18-35', dealbreakers: '' });

    // Fetch Profile Data from Express API
    useEffect(() => {
        if (!user?.id) return;

        const fetchProfile = async () => {
            try {
                const data = await datingApi.getMyProfile();
                if (data) {
                    if (data.media) {
                        setPhotos(data.media.photos || []);
                        setVideos(data.media.videos || []);
                        setVoiceNotes(data.media.voice || []);
                    }
                    setAboutMe({
                        bio: data.bio || '',
                        age: data.age?.toString() || '',
                        location: data.location || '',
                        lat: data.lat || null,
                        lng: data.lng || null,
                        occupation: data.profile_data?.occupation || '',
                        height: data.height || '',
                        zodiac: data.profile_data?.zodiac || '',
                    });
                    if (data.profile_data?.lookingFor) {
                        setLookingFor(data.profile_data.lookingFor);
                    }
                    if (data.interests) setInterests(data.interests);
                }
            } catch (err) {
                console.warn('Failed to load profile:', err);
            }
        };
        fetchProfile();
    }, [user?.id]);

    // ── Web3 Integration ──
    const { address, isConnected } = useAccount();
    const [isWeb3Verified, setIsWeb3Verified] = useState(false);

    useEffect(() => {
        const verifyWeb3 = async () => {
            if (isConnected && address) {
                const hasNft = await checkNftOwnership(address);
                setIsWeb3Verified(hasNft);
                if (hasNft) {
                    toast.success("NFT Verified! You are a RedFlag Citizen 🛡️");
                    persistProfileData('web3', { isVerifiedWeb3: true, wallet: address });
                }
            }
        };
        verifyWeb3();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, address]);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [playingVoice, setPlayingVoice] = useState(null);
    const [activeTab, setActiveTab] = useState('photos');

    const [editingBio, setEditingBio] = useState(false);
    const [editingLookingFor, setEditingLookingFor] = useState(false);
    const [newInterest, setNewInterest] = useState('');

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);
    const audioRef = useRef(null);
    const photoInputRef = useRef(null);
    const videoInputRef = useRef(null);

    // Persist media to Express API
    const updateMediaInDB = async (type, newMedia) => {
        if (!user?.id) return;
        try {
            const currentProfile = await datingApi.getMyProfile().catch(() => ({}));
            const currentMedia = currentProfile?.media || {};
            const updatedMedia = { ...currentMedia, [type]: newMedia };

            await datingApi.saveProfile({
                media: updatedMedia,
                photos: type === 'photos' ? newMedia.map(p => p.data) : (currentProfile?.photos || [])
            });

            if (type === 'photos' && newMedia.length > 0) {
                await usersApi.updateMe({ photo_url: newMedia[0].data });
            }
        } catch (error) {
            console.error(`Error updating ${type}:`, error);
        }
    };

    // Persist profile data
    const persistProfileData = async (key, data) => {
        if (!user?.id) return;
        try {
            const updates = {};
            if (key === 'aboutMe') {
                updates.bio = data.bio;
                updates.age = parseInt(data.age) || null;
                updates.height = data.height;
                updates.location = data.location;
                if (data.lat && data.lng) { updates.lat = data.lat; updates.lng = data.lng; }
                const currentProfile = await datingApi.getMyProfile().catch(() => ({}));
                updates.profile_data = { ...(currentProfile?.profile_data || {}), ...data };
            } else if (key === 'interests') {
                updates.interests = data;
            } else if (key === 'lookingFor') {
                const currentProfile = await datingApi.getMyProfile().catch(() => ({}));
                updates.profile_data = { ...(currentProfile?.profile_data || {}), lookingFor: data };
            } else if (key === 'web3') {
                updates.profile_data = data;
            }
            await datingApi.saveProfile(updates);
        } catch (error) {
            console.error(`Error saving ${key}:`, error);
        }
    };

    const toggleDarkMode = (enabled) => {
        setDarkMode(enabled);
        localStorage.setItem('redflag_theme', enabled ? 'dark' : 'light');
        if (enabled) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    };

    const handleLogout = () => { logout(); navigate('/login'); };

    // ── Photo Handling ──
    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (photos.length + files.length > 6) {
            toast.error('Maximum 6 photos allowed');
            return;
        }

        toast.info('Uploading photos...', { autoClose: 2000 });

        const newPhotos = [];
        for (const file of files) {
            try {
                let downloadURL;
                let ipfsHash = null;

                // 1. Upload to Express backend
                downloadURL = await uploadFile(file, 'profile');

                // 2. Upload to IPFS (IPFS Storage)
                const ipfsResult = await uploadToIPFS(file);
                ipfsHash = ipfsResult.hash;

                newPhotos.push({
                    id: Date.now().toString() + '_' + file.name,
                    data: downloadURL,
                    addedAt: Date.now(),
                    ipfsHash: ipfsHash,
                    isNft: false,
                    tokenId: null
                });
            } catch (error) {
                console.error("Photo upload failed:", error);
                toast.error(`Failed to upload ${file.name}`);
            }
        }

        if (newPhotos.length > 0) {
            const updatedPhotos = [...photos, ...newPhotos];
            setPhotos(updatedPhotos);
            updateMediaInDB('photos', updatedPhotos);
            toast.success(`${newPhotos.length} photo(s) added!`);
        }
        e.target.value = '';
    };

    const removePhoto = (id) => {
        const updated = photos.filter(p => p.id !== id);
        setPhotos(updated);
        updateMediaInDB('photos', updated);
        toast.success('Photo removed');
    };

    // ── Video Handling ──
    const handleVideoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (videos.length >= 3) {
            toast.error('Maximum 3 videos allowed');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            toast.error('Video must be under 50MB');
            return;
        }

        toast.info('Uploading video... please wait', { autoClose: 3000 });

        try {
            const downloadURL = await uploadFile(file, 'profile');
            const newVideo = {
                id: Date.now(),
                data: downloadURL,
                name: file.name,
                size: (file.size / (1024 * 1024)).toFixed(1),
                addedAt: Date.now()
            };

            const updatedVideos = [...videos, newVideo];
            setVideos(updatedVideos);
            updateMediaInDB('videos', updatedVideos);
            toast.success('Video added!');
        } catch (error) {
            console.error("Video upload failed:", error);
            toast.error("Failed to upload video");
        }
        e.target.value = '';
    };

    const removeVideo = (id) => {
        const updated = videos.filter(v => v.id !== id);
        setVideos(updated);
        updateMediaInDB('videos', updated);
        toast.success('Video removed');
    };

    // ── Voice Note Recording ──
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

                // Optional: Playback locally before upload? For now, direct upload.
                toast.info('Saving voice note...', { autoClose: 2000 });

                try {
                    const downloadURL = await uploadFile(blob, 'profile');
                    const newNote = {
                        id: Date.now(),
                        data: downloadURL,
                        duration: recordingTime,
                        addedAt: Date.now(),
                    };

                    const updatedNotes = [...voiceNotes, newNote];
                    setVoiceNotes(updatedNotes);
                    updateMediaInDB('voice', updatedNotes);
                    toast.success('Voice note saved! 🎙️');
                } catch (error) {
                    console.error("Voice note upload failed:", error);
                    toast.error("Failed to save voice note");
                }

                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch {
            toast.error('Microphone access denied');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
        }
    };

    const playVoiceNote = (note) => {
        if (playingVoice === note.id) {
            audioRef.current?.pause();
            setPlayingVoice(null);
            return;
        }
        const audio = new Audio(note.data);
        audioRef.current = audio;
        audio.onended = () => setPlayingVoice(null);
        audio.play();
        setPlayingVoice(note.id);
    };

    const removeVoiceNote = (id) => {
        if (playingVoice === id) { audioRef.current?.pause(); setPlayingVoice(null); }
        const updated = voiceNotes.filter(v => v.id !== id);
        setVoiceNotes(updated);
        updateMediaInDB('voice', updated);
        toast.success('Voice note removed');
    };

    const formatTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

    const mediaTabs = [
        { key: 'photos', label: 'Photos', icon: 'photo_library', count: photos.length },
        { key: 'videos', label: 'Videos', icon: 'videocam', count: videos.length },
        { key: 'voice', label: 'Voice', icon: 'mic', count: voiceNotes.length },
    ];

    return (
        <div className="bg-background-light dark:bg-background-dark font-display text-gray-900 dark:text-gray-100 min-h-screen flex justify-center">
            <div className="w-full max-w-md bg-background-light dark:bg-background-dark min-h-screen flex flex-col relative shadow-2xl overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-4 sticky top-0 z-10 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
                        <span className="material-icons text-gray-600 dark:text-gray-300">chevron_left</span>
                    </button>
                    <h1 className="text-lg font-semibold text-center flex-grow pr-8">Profile</h1>
                    <div className="w-2"></div>
                </header>

                {/* Profile Avatar */}
                <div className="px-4 pt-6 pb-2 flex flex-col items-center">
                    <div className="relative group">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-primary/20 overflow-hidden"
                            style={isWeb3Verified ? { boxShadow: '0 0 0 3px #3b82f6, 0 0 20px rgba(99,102,241,0.5)' } : {}}
                        >
                            {photos.length > 0 ? (
                                <img src={photos[0].data} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'
                            )}
                        </div>
                        {/* NFT Citizenship Hexagon Badge */}
                        {isWeb3Verified && (
                            <div title="RedFlag Citizen NFT" style={{
                                position: 'absolute', bottom: -2, right: -2,
                                width: 28, height: 28,
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 12px rgba(99,102,241,0.9)',
                                animation: 'pulse 2s infinite',
                                border: '2px solid white',
                                zIndex: 10
                            }}>
                                <span style={{ color: 'white', fontSize: 12, fontWeight: 'bold', lineHeight: 1 }}>✓</span>
                            </div>
                        )}
                        <button
                            onClick={() => photoInputRef.current?.click()}
                            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg border-2 border-background-light dark:border-background-dark hover:scale-110 active:scale-90 transition-transform"
                        >
                            <span className="material-icons text-sm">add_a_photo</span>
                        </button>
                    </div>
                    <p className="text-base font-semibold text-gray-900 dark:text-white mt-3 flex items-center gap-2">
                        {user?.name || 'User'}
                        {isWeb3Verified && (
                            <span title="RedFlag Citizen" style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 20, height: 20,
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                                boxShadow: '0 0 8px rgba(99,102,241,0.8)',
                                flexShrink: 0
                            }}>
                                <span style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>✓</span>
                            </span>
                        )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <span className="material-icons text-xs">lock</span>
                        {user?.email ? `${user.email[0]}${'•'.repeat(Math.min(user.email.indexOf('@') - 1, 6))}${user.email.slice(user.email.indexOf('@'))}` : 'No email'}
                    </p>
                    {isWeb3Verified && address && (
                        <p className="text-[10px] text-blue-400 font-mono mt-0.5">{address.slice(0, 6)}...{address.slice(-4)} 🔷</p>
                    )}
                    {aboutMe.location && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="material-icons text-xs">location_on</span>{aboutMe.location}</p>}
                </div>

                <main className="flex-grow p-4 space-y-6 overflow-y-auto pb-24">
                    {/* ════════════════════════════════════════ */}
                    {/*  ABOUT ME SECTION                      */}
                    {/* ════════════════════════════════════════ */}
                    <section className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="p-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">About Me</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Tell people about yourself</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (editingBio) {
                                        persistProfileData('aboutMe', aboutMe);
                                        toast.success('Profile saved! ✨');
                                    }
                                    setEditingBio(!editingBio);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editingBio ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                            >
                                {editingBio ? 'Save' : 'Edit'}
                            </button>
                        </div>

                        <div className="px-4 pb-4 space-y-3">
                            {/* Bio Text */}
                            {editingBio ? (
                                <textarea
                                    value={aboutMe.bio}
                                    onChange={(e) => setAboutMe(prev => ({ ...prev, bio: e.target.value }))}
                                    placeholder="Write something about yourself... Who are you? What makes you unique?"
                                    rows={3}
                                    maxLength={300}
                                    className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary resize-none transition-colors"
                                />
                            ) : (
                                <p className={`text-sm ${aboutMe.bio ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 italic'}`}>
                                    {aboutMe.bio || 'No bio yet. Tap Edit to add one!'}
                                </p>
                            )}
                            {editingBio && <p className="text-right text-[10px] text-gray-400">{aboutMe.bio.length}/300</p>}

                            {/* Quick Info Grid */}
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { key: 'age', icon: 'cake', label: 'Age', placeholder: '25' },
                                    { key: 'location', icon: 'location_on', label: 'Location', placeholder: 'Miami, FL' },
                                    { key: 'occupation', icon: 'work', label: 'Occupation', placeholder: 'Designer' },
                                    { key: 'height', icon: 'straighten', label: 'Height', placeholder: "5'10\"" },
                                ].map(field => (
                                    <div key={field.key} className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="material-icons text-primary text-xs">{field.icon}</span>
                                            <span className="text-[10px] text-gray-400 font-medium uppercase">{field.label}</span>
                                        </div>
                                        {editingBio ? (
                                            <input
                                                type="text"
                                                value={aboutMe[field.key]}
                                                onChange={(e) => setAboutMe(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                placeholder={field.placeholder}
                                                className="w-full bg-transparent text-sm font-medium text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 focus:outline-none"
                                            />
                                        ) : (
                                            <p className={`text-sm font-medium ${aboutMe[field.key] ? 'text-gray-900 dark:text-white' : 'text-gray-300 dark:text-gray-600'}`}>
                                                {aboutMe[field.key] || '—'}
                                            </p>
                                        )}
                                        {field.key === 'location' && editingBio && (
                                            <button
                                                onClick={() => {
                                                    if ('geolocation' in navigator) {
                                                        toast.info("Getting location...");
                                                        navigator.geolocation.getCurrentPosition(
                                                            async (pos) => {
                                                                const { latitude, longitude } = pos.coords;

                                                                try {
                                                                    // Reverse geocoding for display name (optional, simplified here)
                                                                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                                                                    const data = await res.json();
                                                                    const city = data.address.city || data.address.town || data.address.village || "Unknown City";
                                                                    const country = data.address.country || "";

                                                                    setAboutMe(prev => ({
                                                                        ...prev,
                                                                        lat: latitude,
                                                                        lng: longitude,
                                                                        location: `${city}, ${country}`
                                                                    }));
                                                                    toast.success("Location updated!");
                                                                } catch {
                                                                    setAboutMe(prev => ({ ...prev, lat: latitude, lng: longitude, location: "Coordinates saved" }));
                                                                    toast.success("Coordinates saved!");
                                                                }
                                                            },
                                                            () => toast.error("Could not get location.")
                                                        );
                                                    }
                                                }}
                                                className="mt-2 w-full flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                                            >
                                                <span className="material-icons text-[14px]">my_location</span>
                                                Use Current GPS
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Zodiac */}
                            {editingBio && (
                                <div>
                                    <p className="text-[10px] text-gray-400 font-medium uppercase mb-2 flex items-center gap-1"><span className="material-icons text-xs text-primary">auto_awesome</span>Zodiac Sign</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['♈ Aries', '♉ Taurus', '♊ Gemini', '♋ Cancer', '♌ Leo', '♍ Virgo', '♎ Libra', '♏ Scorpio', '♐ Sagittarius', '♑ Capricorn', '♒ Aquarius', '♓ Pisces'].map(sign => (
                                            <button
                                                key={sign}
                                                onClick={() => setAboutMe(prev => ({ ...prev, zodiac: sign }))}
                                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${aboutMe.zodiac === sign
                                                    ? 'bg-primary text-white shadow-sm'
                                                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-primary/10'
                                                    }`}
                                            >
                                                {sign}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {!editingBio && aboutMe.zodiac && (
                                <div className="flex items-center gap-2 bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2 border border-gray-100 dark:border-white/5">
                                    <span className="material-icons text-primary text-xs">auto_awesome</span>
                                    <span className="text-xs text-gray-600 dark:text-gray-300">{aboutMe.zodiac}</span>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ════════════════════════════════════════ */}
                    {/*  INTERESTS SECTION                     */}
                    {/* ════════════════════════════════════════ */}
                    <section className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="p-4 pb-2">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Interests</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">What are you into?</p>
                        </div>
                        <div className="px-4 pb-4">
                            <div className="flex flex-wrap gap-2 mb-3">
                                {interests.map((tag, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                                        {tag}
                                        <button onClick={() => {
                                            const newVal = interests.filter((_, i) => i !== idx);
                                            setInterests(newVal);
                                            persistProfileData('interests', newVal);
                                        }} className="hover:text-red-500 transition-colors">
                                            <span className="material-icons text-xs">close</span>
                                        </button>
                                    </span>
                                ))}
                                {interests.length === 0 && <p className="text-xs text-gray-400 italic">No interests added yet</p>}
                            </div>
                            {/* Quick Add Suggestions */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {['🎵 Music', '✈️ Travel', '🏋️ Fitness', '📚 Reading', '🎮 Gaming', '🍳 Cooking', '🎬 Movies', '🐕 Dogs', '🐱 Cats', '📸 Photography', '🎨 Art', '💃 Dancing', '🏖️ Beach', '⛰️ Hiking', '🍷 Wine', '☕ Coffee', '🧘 Yoga', '🏀 Sports'].filter(s => !interests.includes(s)).slice(0, 8).map(suggestion => (
                                    <button
                                        key={suggestion}
                                        onClick={() => {
                                            const newVal = [...interests, suggestion];
                                            setInterests(newVal);
                                            persistProfileData('interests', newVal);
                                            toast.success('Interest added!');
                                        }}
                                        className="px-2.5 py-1 rounded-full text-[11px] bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-gray-200 dark:border-white/5"
                                    >
                                        + {suggestion}
                                    </button>
                                ))}
                            </div>
                            {/* Custom Interest */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newInterest}
                                    onChange={(e) => setNewInterest(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newInterest.trim()) {
                                            const newVal = [...interests, newInterest.trim()];
                                            setInterests(newVal);
                                            persistProfileData('interests', newVal);
                                            setNewInterest('');
                                            toast.success('Interest added!');
                                        }
                                    }}
                                    placeholder="Add custom interest..."
                                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-primary"
                                />
                                <button
                                    onClick={() => {
                                        if (newInterest.trim()) {
                                            const newVal = [...interests, newInterest.trim()];
                                            setInterests(newVal);
                                            persistProfileData('interests', newVal);
                                            setNewInterest('');
                                            toast.success('Interest added!');
                                        }
                                    }}
                                    className="px-3 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors active:scale-95"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ════════════════════════════════════════ */}
                    {/*  LOOKING FOR SECTION                   */}
                    {/* ════════════════════════════════════════ */}
                    <section className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="p-4 flex justify-between items-center">
                            <div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <span className="material-icons text-pink-500 text-lg">favorite</span>
                                    Looking For
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">What are you searching for in dating?</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (editingLookingFor) {
                                        persistProfileData('lookingFor', lookingFor);
                                        toast.success('Preferences saved! 💕');
                                    }
                                    setEditingLookingFor(!editingLookingFor);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editingLookingFor ? 'bg-green-500 text-white' : 'bg-pink-500/10 text-pink-500 hover:bg-pink-500/20'}`}
                            >
                                {editingLookingFor ? 'Save' : 'Edit'}
                            </button>
                        </div>

                        <div className="px-4 pb-4 space-y-3">
                            {/* Relationship Type */}
                            <div>
                                <p className="text-[10px] text-gray-400 font-medium uppercase mb-2">Relationship Type</p>
                                {editingLookingFor ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {['💍 Serious Relationship', '💬 Casual Dating', '👋 New Friends', '🤷 Not Sure Yet', '💑 Marriage'].map(type => (
                                            <button
                                                key={type}
                                                onClick={() => setLookingFor(prev => ({ ...prev, type }))}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${lookingFor.type === type
                                                    ? 'bg-pink-500 text-white shadow-sm'
                                                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-pink-500/10'
                                                    }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={`text-sm font-medium ${lookingFor.type ? 'text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
                                        {lookingFor.type || 'Not specified'}
                                    </p>
                                )}
                            </div>

                            {/* Age Range */}
                            <div>
                                <p className="text-[10px] text-gray-400 font-medium uppercase mb-2">Preferred Age Range</p>
                                {editingLookingFor ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {['18-25', '25-30', '30-35', '35-40', '40-50', '50+'].map(range => (
                                            <button
                                                key={range}
                                                onClick={() => setLookingFor(prev => ({ ...prev, ageRange: range }))}
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${lookingFor.ageRange === range
                                                    ? 'bg-primary text-white shadow-sm'
                                                    : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-primary/10'
                                                    }`}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">Ages {lookingFor.ageRange}</p>
                                )}
                            </div>

                            {/* Dealbreakers */}
                            <div>
                                <p className="text-[10px] text-gray-400 font-medium uppercase mb-2 flex items-center gap-1"><span className="material-icons text-xs text-red-500">flag</span>Dealbreakers</p>
                                {editingLookingFor ? (
                                    <textarea
                                        value={lookingFor.dealbreakers}
                                        onChange={(e) => setLookingFor(prev => ({ ...prev, dealbreakers: e.target.value }))}
                                        placeholder="What are your absolute no-go's? (e.g. smoking, no ambition...)"
                                        rows={2}
                                        className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-red-400 resize-none transition-colors"
                                    />
                                ) : (
                                    <p className={`text-sm ${lookingFor.dealbreakers ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 italic'}`}>
                                        {lookingFor.dealbreakers || 'None specified'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>
                    {/* ════════════════════════════════════════ */}
                    {/*  MEDIA SECTION                          */}
                    {/* ════════════════════════════════════════ */}
                    <section className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="p-4 pb-2">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">My Media</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Photos, videos & voice notes</p>
                        </div>

                        {/* Media Tabs */}
                        <div className="flex border-b border-gray-100 dark:border-gray-700 px-2">
                            {mediaTabs.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all border-b-2 ${activeTab === tab.key
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <span className="material-icons text-sm">{tab.icon}</span>
                                    {tab.label}
                                    {tab.count > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-gray-200 dark:bg-white/10 text-gray-500'}`}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Photos Tab */}
                        {activeTab === 'photos' && (
                            <div className="p-4">
                                <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                                <div className="grid grid-cols-3 gap-2">
                                    {photos.map((photo) => (
                                        <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
                                            <img src={photo.data} alt="Profile" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                                                <button
                                                    onClick={() => removePhoto(photo.id)}
                                                    className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-full bg-red-500/80 text-white flex items-center justify-center transition-all hover:bg-red-500 active:scale-90"
                                                >
                                                    <span className="material-icons text-sm">close</span>
                                                </button>
                                            </div>
                                            {photos[0]?.id === photo.id && (
                                                <span className="absolute top-1.5 left-1.5 bg-primary text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">Main</span>
                                            )}
                                            {photo.isNft && (
                                                <span className="absolute top-1.5 right-1.5 bg-purple-600/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase flex items-center gap-0.5 backdrop-blur-sm border border-white/20">
                                                    <span className="material-icons text-[8px]">token</span> NFT
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {photos.length < 6 && (
                                        <button
                                            onClick={() => photoInputRef.current?.click()}
                                            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-all active:scale-95 gap-1"
                                        >
                                            <span className="material-icons text-gray-400 text-xl">add_photo_alternate</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{photos.length}/6</span>
                                        </button>
                                    )}
                                </div>
                                {photos.length === 0 && (
                                    <p className="text-center text-xs text-gray-400 mt-3">Add up to 6 photos to your profile</p>
                                )}
                            </div>
                        )}

                        {/* Videos Tab */}
                        {activeTab === 'videos' && (
                            <div className="p-4">
                                <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                                <div className="space-y-3">
                                    {videos.map((video) => (
                                        <div key={video.id} className="relative rounded-xl overflow-hidden bg-gray-900 border border-gray-100 dark:border-white/5">
                                            <video src={video.data} className="w-full max-h-48 object-contain bg-black" controls playsInline />
                                            <div className="absolute top-2 right-2 flex gap-1.5">
                                                <span className="bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">{video.size}MB</span>
                                                <button
                                                    onClick={() => removeVideo(video.id)}
                                                    className="w-6 h-6 rounded-full bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500 active:scale-90 transition-all"
                                                >
                                                    <span className="material-icons text-xs">close</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {videos.length < 3 && (
                                        <button
                                            onClick={() => videoInputRef.current?.click()}
                                            className="w-full py-6 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 flex flex-col items-center justify-center hover:border-primary hover:bg-primary/5 transition-all active:scale-95 gap-2"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                                <span className="material-icons text-primary text-xl">video_call</span>
                                            </div>
                                            <span className="text-xs text-gray-400 font-medium">Upload Video ({videos.length}/3)</span>
                                            <span className="text-[10px] text-gray-400">Max 50MB</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Voice Notes Tab */}
                        {activeTab === 'voice' && (
                            <div className="p-4">
                                {/* Recorder */}
                                <div className={`rounded-xl p-4 mb-4 flex items-center gap-4 transition-all ${isRecording ? 'bg-red-500/10 border border-red-500/20' : 'bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5'}`}>
                                    <button
                                        onClick={isRecording ? stopRecording : startRecording}
                                        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 flex-shrink-0 ${isRecording
                                            ? 'bg-red-500 text-white animate-pulse shadow-red-500/30'
                                            : 'bg-gradient-to-br from-primary to-purple-500 text-white shadow-primary/30 hover:scale-105'
                                            }`}
                                    >
                                        <span className="material-icons text-2xl">{isRecording ? 'stop' : 'mic'}</span>
                                    </button>
                                    <div className="flex-1">
                                        {isRecording ? (
                                            <>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                                    <span className="text-sm font-semibold text-red-500">Recording...</span>
                                                </div>
                                                <span className="text-2xl font-bold font-mono text-gray-900 dark:text-white">{formatTime(recordingTime)}</span>
                                                <div className="flex gap-1 mt-1">
                                                    {[...Array(12)].map((_, i) => (
                                                        <div key={i} className="w-1 bg-red-500/60 rounded-full animate-pulse" style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 0.1}s` }} />
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Record Voice Note</p>
                                                <p className="text-xs text-gray-400">Tap to start recording</p>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Saved Voice Notes */}
                                {voiceNotes.length > 0 ? (
                                    <div className="space-y-2">
                                        {voiceNotes.map((note, idx) => (
                                            <div key={note.id} className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                                                <button
                                                    onClick={() => playVoiceNote(note)}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-90 ${playingVoice === note.id
                                                        ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                                        : 'bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-primary/20 hover:text-primary'
                                                        }`}
                                                >
                                                    <span className="material-icons text-lg">{playingVoice === note.id ? 'pause' : 'play_arrow'}</span>
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Voice Note #{idx + 1}</p>
                                                    <p className="text-[10px] text-gray-400">{formatTime(note.duration)} • {new Date(note.addedAt).toLocaleDateString()}</p>
                                                    {/* Waveform visualization */}
                                                    <div className="flex gap-0.5 mt-1.5 items-end h-4">
                                                        {[...Array(20)].map((_, i) => (
                                                            <div key={i} className={`w-1 rounded-full transition-all ${playingVoice === note.id ? 'bg-primary animate-pulse' : 'bg-gray-300 dark:bg-white/15'}`}
                                                                style={{ height: `${4 + Math.sin(i * 0.8) * 8 + Math.random() * 4}px`, animationDelay: `${i * 0.05}s` }} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => removeVoiceNote(note.id)}
                                                    className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
                                                >
                                                    <span className="material-icons text-base">delete</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-xs text-gray-400 mt-4">Record your voice to let matches hear you!</p>
                                )}
                            </div>
                        )}
                    </section>

                    {/* ════════════════════════════════════════ */}
                    {/*  WEB3 VERIFICATION SECTION             */}
                    {/* ════════════════════════════════════════ */}
                    <section className="bg-white dark:bg-[#1a202c] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-2">
                                <span className="material-icons text-purple-500">token</span>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Web3 & NFT</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">RedFlag Citizenship Verification</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 flex flex-col items-center justify-center gap-5">
                            {/* Hexagon Badge Preview */}
                            <div style={{
                                width: 72, height: 72,
                                background: isWeb3Verified
                                    ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                                    : 'linear-gradient(135deg, #6b7280, #4b5563)',
                                clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: isWeb3Verified ? '0 0 30px rgba(99,102,241,0.7)' : 'none',
                                transition: 'all 0.5s ease'
                            }}>
                                <span style={{ color: 'white', fontSize: 28 }}>
                                    {isWeb3Verified ? '✓' : '?'}
                                </span>
                            </div>

                            <div className="text-center">
                                <p className={`text-sm font-bold ${isWeb3Verified ? 'text-blue-400' : 'text-gray-500'}`}>
                                    {isWeb3Verified ? '🔷 RedFlag Citizen' : 'No Citizenship NFT'}
                                </p>
                                {isWeb3Verified && address && (
                                    <p className="text-[10px] text-gray-400 font-mono mt-1">{address.slice(0, 6)}...{address.slice(-4)}</p>
                                )}
                            </div>

                            <ConnectKitButton />

                            {isConnected && !isWeb3Verified && (
                                <div className="px-4 py-2 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-500 flex items-center gap-2 text-xs font-medium w-full justify-center">
                                    <span className="material-icons text-sm">pending</span>
                                    Verificando NFT...
                                </div>
                            )}

                            <p className="text-[10px] text-gray-400 text-center max-w-xs leading-relaxed">
                                Conecta tu wallet de Polygon. Si tienes un NFT "RedFlag Citizenship", recibirás un badge hexagonal azul en tu perfil.
                            </p>
                        </div>
                    </section>


                    {/* Danger Zone */}
                    <div className="pt-4 flex flex-col items-center gap-3">
                        <button
                            onClick={handleLogout}
                            className="w-full text-sm font-medium text-gray-700 dark:text-gray-200 py-3 rounded-lg bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
                        >
                            Log Out
                        </button>
                        <button
                            onClick={() => navigate('/subscribe')}
                            className="text-sm text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors py-2 px-4 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                            Cancel Subscription
                        </button>
                    </div>

                    {/* Appearance */}
                    <section className="pt-6 border-t border-gray-100 dark:border-gray-800">
                        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 pl-1">Appearance</h3>
                        <div className="bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                                        <span className="material-icons text-gray-600 dark:text-gray-300 text-lg">{darkMode ? 'dark_mode' : 'light_mode'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">Dark Mode</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{darkMode ? 'On' : 'Off'}</span>
                                    </div>
                                </div>
                                <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                    <input
                                        type="checkbox"
                                        className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300 checked:right-0 checked:border-primary transition-all duration-300 ease-in-out"
                                        id="dark-mode"
                                        checked={darkMode}
                                        onChange={(e) => toggleDarkMode(e.target.checked)}
                                    />
                                    <label className="toggle-label block overflow-hidden h-5 rounded-full bg-gray-300 cursor-pointer dark:bg-gray-600 checked:bg-primary transition-colors duration-300" htmlFor="dark-mode"></label>
                                </div>
                            </div>
                        </div>
                    </section>


                    {/* Settings & Privacy */}
                    <section className="pt-6 border-t border-gray-100 dark:border-gray-800">
                        <button
                            onClick={() => navigate('/settings')}
                            className="w-full bg-white dark:bg-[#1a202c] rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                    <span className="material-icons text-primary text-lg">settings</span>
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">Settings & Privacy</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Security, notifications & data</span>
                                </div>
                            </div>
                            <span className="material-icons text-gray-400 text-lg">chevron_right</span>
                        </button>
                    </section>

                </main>
            </div>
            <style>{`
        .toggle-checkbox:checked { right: 0; border-color: #d411b4; }
        .toggle-checkbox:checked + .toggle-label { background-color: #d411b4; }
      `}</style>
        </div >
    );
}
