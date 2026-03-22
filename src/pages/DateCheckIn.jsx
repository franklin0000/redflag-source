import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import {
    watchLocation,
    getGoogleMapsLink,
    getEmergencyNumber,
    isGeolocationSupported,
} from '../services/locationService';
import { contactsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { twilioApi } from '../services/twilioService';
import { voiceCheckInService } from '../services/voiceCheckInService';

export default function DateCheckIn() {
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();

    // Guard state
    const [isActive, setIsActive] = useState(false);
    const [duration, setDuration] = useState(120);
    const [timeLeft, setTimeLeft] = useState(0);
    const timerRef = useRef(null);
    const isActiveRef = useRef(isActive);

    // Meeting Profile (passed from chat or manual)
    const { state } = useLocation();
    const [meetingProfile, setMeetingProfile] = useState(state?.meetingProfile || null);

    // Contacts (backed by API + localStorage)
    const [contacts, setContacts] = useState(() => {
        const saved = localStorage.getItem('rf_saved_contacts');
        return saved ? JSON.parse(saved) : [];
    });

    // Load contacts from API on mount
    useEffect(() => {
        if (!user?.id) { return; }
        contactsApi.getAll()
            .then((data) => {
                if (data && data.length > 0) {
                    setContacts(data);
                    localStorage.setItem('rf_saved_contacts', JSON.stringify(data));
                }
            })
            .catch(() => { });
    }, [user?.id]);

    // Location state
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState(null);
    const [isTracking, setIsTracking] = useState(false);
    const stopWatchRef = useRef(null);

    // Emergency
    const [emergencyNumber, setEmergencyNumber] = useState({ number: '911', label: '911 (US)' });
    const [isPanicking, setIsPanicking] = useState(false);
    const [panicWarning, setPanicWarning] = useState(0); // countdown seconds before auto-panic
    const panicWarningRef = useRef(null);

    // Audio for siren — initialize with fallback on error
    const sirenAudio = useRef(null);
    useEffect(() => {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
        audio.addEventListener('error', () => {
            audio.src = 'https://cdn.freesound.org/previews/555/555277_6893982-lq.mp3';
            audio.load();
        });
        sirenAudio.current = audio;
        return () => { audio.pause(); };
    }, []);

    // Sync isActive ref
    useEffect(() => {
        isActiveRef.current = isActive;
    }, [isActive]);

    // No auto-save effect needed — contacts are saved per-action via API

    // Detect emergency number when location changes
    useEffect(() => {
        if (location) {
            getEmergencyNumber(location.lat, location.lng).then(setEmergencyNumber);
        }
    }, [location]);

    // Start GPS tracking
    const startTracking = useCallback(() => {
        if (!isGeolocationSupported()) {
            setLocationError('GPS not supported in this browser');
            return;
        }
        setIsTracking(true);
        setLocationError(null);
        stopWatchRef.current = watchLocation(
            (coords) => {
                setLocation(coords);
                setLocationError(null);
            },
            (err) => {
                setLocationError(err.message || 'Location access denied');
                setIsTracking(false);
            }
        );
    }, []);

    // Stop GPS tracking
    const stopTracking = useCallback(() => {
        if (stopWatchRef.current) {
            stopWatchRef.current();
            stopWatchRef.current = null;
        }
        setIsTracking(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        const audio = sirenAudio.current;
        return () => {
            if (stopWatchRef.current) stopWatchRef.current();
            clearInterval(timerRef.current);
            if (audio) audio.pause();
            if (navigator.vibrate) navigator.vibrate(0);
        };
    }, []);

    // Send SMS alerts via Twilio (with fallback to native SMS)
    const notifyContacts = useCallback(async (type, message, locationLink = null) => {
        if (contacts.length === 0) return;

        let fullMessage = `[RedFlag ${type}] ${message}`;
        if (locationLink) fullMessage += `\n📍 Location: ${locationLink}`;
        if (meetingProfile) {
            fullMessage += `\n👤 Meeting: ${meetingProfile.name}`;
            if (meetingProfile.id) fullMessage += `\n🔗 ${window.location.origin}/profile/${meetingProfile.id}`;
        }
        fullMessage += `\nTime: ${new Date().toLocaleTimeString()}`;

        const validContacts = contacts.filter(c => c.phone);

        // Try Twilio first
        try {
            if (type === 'SOS ALERT') {
                await twilioApi.sendSOS(
                    validContacts.map(c => ({ name: c.name, phone: c.phone })),
                    locationLink,
                    user?.name
                );
            } else {
                for (const contact of validContacts) {
                    await twilioApi.sendSMS(contact.phone, fullMessage);
                }
            }
            toast.info(`Alert sent via SMS to ${validContacts.map(c => c.name).join(', ')}`);
        } catch (err) {
            // Fallback to native SMS
            console.warn('Twilio failed, falling back to native SMS:', err.message);
            const encodedMsg = encodeURIComponent(fullMessage);
            const phones = validContacts.map(c => c.phone.replace(/[^0-9+]/g, ''));
            if (phones.length > 0) {
                window.location.href = `sms:${phones.join(',')}?body=${encodedMsg}`;
            }
        }
    }, [contacts, toast, meetingProfile, user, location]);

    // Start guard
    const startTimer = () => {
        if (contacts.length === 0 || !contacts[0].name || !contacts[0].phone) {
            toast.error("Please add a trusted contact first");
            return;
        }
        setTimeLeft(duration * 60);
        setIsActive(true);
        startTracking();
        toast.success(`Guardia Personal Activated! Tracking your location. We'll check on you in ${duration} mins.`);

        // Notify start
        notifyContacts(
            'Guard Started',
            `I'm starting a Date Guard for ${Math.floor(duration / 60)}h ${duration % 60}m. I will check in when I'm safe.`
        );
    };

    // Stop guard
    const stopTimer = () => {
        clearInterval(timerRef.current);
        setIsActive(false);
        setTimeLeft(0);
        stopTracking();
        toast.success("Check-In Confirmed. Stay safe! 💖");

        // Notify safe
        notifyContacts(
            'Check-In: SAFE',
            `I have ended my Date Guard. I am safe! ✅`,
            location ? getGoogleMapsLink(location.lat, location.lng) : null
        );
    };

    // Panic handler
    const handlePanic = useCallback(async () => {
        setIsPanicking(true);
        const mapsLink = location ? getGoogleMapsLink(location.lat, location.lng) : 'Location unavailable';
        const sosMessage = `🚨 URGENT: I need help! I triggered my panic button. Location: ${mapsLink}`;

        // 1. Audible Alarm (with fallback source if primary fails)
        if (sirenAudio.current) {
            sirenAudio.current.loop = true;
            sirenAudio.current.play().catch(() => {
                const fallback = new Audio('https://cdn.freesound.org/previews/555/555277_6893982-lq.mp3');
                fallback.loop = true;
                fallback.play().catch(() => { });
                sirenAudio.current = fallback;
            });
        }

        // 2. Vibration
        if (navigator.vibrate) {
            navigator.vibrate([500, 200, 500, 200, 1000]);
        }

        // 3. Try Twilio call first, fallback to tel: link
        try {
            await twilioApi.makeEmergencyCall(mapsLink, user?.name);
            // Also try direct native call
            await voiceCheckInService.callEmergency();
        } catch (err) {
            console.warn('Emergency call failed, using native dial:', err.message);
            setTimeout(() => {
                window.location.href = `tel:${emergencyNumber.number}`;
            }, 1500);
        }

        toast.error(`🚨 SOS ACTIVATED! Siren playing & calling ${emergencyNumber.label}...`);

        notifyContacts('SOS ALERT', sosMessage, mapsLink);
    }, [contacts, location, toast, emergencyNumber, notifyContacts, user]);

    // Stop panic (silence alarm)
    const stopPanic = () => {
        setIsPanicking(false);
        if (sirenAudio.current) {
            sirenAudio.current.pause();
            sirenAudio.current.currentTime = 0;
        }
        if (navigator.vibrate) navigator.vibrate(0);
    };

    // Timer effect — when it hits 0, start a voice check-in
    useEffect(() => {
        if (isActiveRef.current && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActiveRef.current) {
            clearInterval(timerRef.current);
            // Start Voice Check-in instead of just showing warning
            setTimeout(async () => {
                setIsActive(false);
                
                // 1. Speak prompt
                await voiceCheckInService.speak("¿Todo bien? ¿Estás tranquila?");
                
                // 2. Listen for response
                const response = await voiceCheckInService.listen();
                
                // 3. Evaluate response
                const positiveWords = ['sí', 'si', 'ok', 'bien', 'todo bien', 'tranquila'];
                const negativeWords = ['no', 'ayuda', 'socorro', 'emergencia'];
                
                if (positiveWords.some(word => response.includes(word))) {
                    toast.success("Safe! Guard deactivated. Stay safe! 💖");
                    notifyContacts('Check-In: SAFE', 'I am safe. I confirmed via voice check-in.');
                    stopTracking();
                } else if (negativeWords.some(word => response.includes(word)) || response === '') {
                    // Trigger SOS if negative or no response
                    handlePanic();
                } else {
                    // Ambiguous response -> give one more chance or trigger SOS?
                    // For safety, let's show the 30s manual warning as fallback
                    setPanicWarning(30);
                }
            }, 0);
        }
        return () => clearInterval(timerRef.current);
    }, [timeLeft]);

    // Pre-panic warning countdown
    useEffect(() => {
        if (panicWarning <= 0) return;
        if (panicWarning === 1) {
            // Countdown reached zero — trigger SOS
            setTimeout(() => {
                setPanicWarning(0);
                handlePanic();
            }, 0);
            return;
        }
        panicWarningRef.current = setTimeout(() => {
            setPanicWarning(prev => prev - 1);
        }, 1000);
        return () => clearTimeout(panicWarningRef.current);
    }, [panicWarning, handlePanic]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    };

    // Contact management — backed by API
    const updateContact = (index, field, value) => {
        const updated = [...contacts];
        updated[index] = { ...updated[index], [field]: value };
        setContacts(updated);
        localStorage.setItem('rf_saved_contacts', JSON.stringify(updated));
    };

    const handleContactBlur = async (index) => {
        const c = contacts[index];
        if (c.name && c.phone) {
            try {
                if (c.id) {
                    await contactsApi.update(c.id, { name: c.name, phone: c.phone });
                } else {
                    const saved = await contactsApi.add({ name: c.name, phone: c.phone });
                    const next = [...contacts];
                    next[index] = saved;
                    setContacts(next);
                    localStorage.setItem('rf_saved_contacts', JSON.stringify(next));
                }
            } catch (err) {
                console.warn('Failed to save contact:', err.message);
            }
        }
    };

    const addContact = () => {
        if (contacts.length < 3) {
            const next = [...contacts, { name: '', phone: '' }];
            setContacts(next);
            localStorage.setItem('rf_saved_contacts', JSON.stringify(next));
        }
    };

    const removeContact = async (index) => {
        const c = contacts[index];
        if (c.id) {
            try { await contactsApi.remove(c.id); } catch (err) { console.warn('Failed to delete contact:', err); }
        }
        const next = contacts.filter((_, i) => i !== index);
        setContacts(next);
        localStorage.setItem('rf_saved_contacts', JSON.stringify(next));
    };

    // Share location manually
    const shareLocation = () => {
        if (!location) {
            toast.error('Location not available yet');
            return;
        }
        const link = getGoogleMapsLink(location.lat, location.lng);
        navigator.clipboard?.writeText(link).then(() => {
            toast.success('📍 Location link copied to clipboard!');
        }).catch(() => {
            toast.success(`📍 Location: ${link}`);
        });
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 pb-32 relative overflow-hidden">
            {/* Background Pulse Animation */}
            {isActive && (
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-600/20 rounded-full animate-ping"></div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-600/10 rounded-full animate-ping delay-75"></div>
                </div>
            )}

            {/* Pre-Panic Warning Overlay — gives user 30s to confirm safety */}
            {panicWarning > 0 && !isPanicking && (
                <div className="fixed inset-0 z-50 bg-orange-900/97 flex flex-col items-center justify-center text-center p-6">
                    <span className="material-icons text-white text-8xl mb-4 animate-bounce">warning_amber</span>
                    <h2 className="text-3xl font-black text-white mb-2 uppercase">Check-In Expired!</h2>
                    <p className="text-orange-100 mb-2 text-lg">Emergency SOS activates in</p>
                    <div className="text-7xl font-mono font-black text-white mb-8 tabular-nums">{panicWarning}s</div>
                    <div className="flex flex-col gap-3 w-full max-w-xs">
                        <button
                            onClick={() => {
                                clearTimeout(panicWarningRef.current);
                                setPanicWarning(0);
                                stopTracking();
                                toast.success("Safe! Guard deactivated. Stay safe! 💖");
                                notifyContacts('Check-In: SAFE', 'I am safe. The timer expired but I confirmed my safety.');
                            }}
                            className="bg-white text-orange-700 px-6 py-5 rounded-xl font-black text-xl shadow-2xl hover:scale-105 transition-transform"
                        >
                            ✅ I'M SAFE — CANCEL SOS
                        </button>
                        <button
                            onClick={() => { setPanicWarning(0); handlePanic(); }}
                            className="bg-red-700 text-white px-6 py-4 rounded-xl font-bold text-lg border border-red-400/40"
                        >
                            🚨 Trigger SOS Now
                        </button>
                    </div>
                </div>
            )}

            {/* Panic Red Overlay */}
            {isPanicking && (
                <div className="fixed inset-0 z-50 bg-red-900/95 flex flex-col items-center justify-center animate-pulse text-center p-6">
                    <span className="material-icons text-white text-9xl mb-4 animate-bounce">warning</span>
                    <h2 className="text-4xl font-black text-white mb-2 uppercase tracking-wider">SOS ACTIVATED</h2>
                    <p className="text-red-100 mb-8 text-xl">Calling Emergency Services in 3s...</p>

                    <div className="grid gap-4 w-full max-w-sm">
                        <a
                            href={`tel:${emergencyNumber.number}`}
                            className="bg-white text-red-600 px-6 py-5 rounded-xl font-black text-2xl flex items-center justify-center gap-3 shadow-2xl hover:scale-105 transition-transform"
                        >
                            <span className="material-icons text-3xl">call</span>
                            CALL {emergencyNumber.label} NOW
                        </a>

                        {contacts.length > 0 && (
                            <a
                                href={`sms:${contacts.filter(c => c.phone).map(c => c.phone.replace(/[^0-9+]/g, '')).join(',')}?body=${encodeURIComponent(`🚨 HELP! I am in danger! My location: ${location ? getGoogleMapsLink(location.lat, location.lng) : 'Unknown'}`)}`}
                                className="bg-red-800 text-white px-6 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 border border-red-400/30 hover:bg-red-700"
                            >
                                <span className="material-icons">send</span>
                                Text All Contacts
                            </a>
                        )}

                        {location && (
                            <a
                                href={getGoogleMapsLink(location.lat, location.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-red-800/50 text-red-200 px-6 py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-red-800"
                            >
                                <span className="material-icons text-sm">place</span>
                                View My Location
                            </a>
                        )}
                    </div>

                    <button
                        onClick={stopPanic}
                        className="mt-12 bg-transparent border-2 border-white/20 text-white/60 px-8 py-3 rounded-full text-sm font-medium hover:bg-white/10 hover:text-white transition-colors"
                    >
                        I'M SAFE - STOP ALARM
                    </button>
                </div>
            )}

            <div className="relative z-10 max-w-md mx-auto flex flex-col">
                <header className="flex items-center justify-between mb-6">
                    <button onClick={() => navigate(-1)} className="text-gray-400">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <span className="material-icons text-purple-500">health_and_safety</span>
                        Guardia Personal
                    </h1>
                    {/* Guardian Mode shortcut */}
                    <button
                        onClick={() => navigate('/guardian-mode')}
                        title="Guardian Mode — let a friend watch your date"
                        className="flex flex-col items-center gap-0.5 text-primary"
                    >
                        <span className="material-icons text-2xl">shield</span>
                        <span className="text-[9px] font-bold uppercase tracking-wide">Guardian</span>
                    </button>
                </header>

                <div className="flex flex-col space-y-5">

                    {/* ===== MEETING DETAILS ===== */}
                    <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="material-icons text-6xl">person_pin</span>
                        </div>
                        <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
                            <span className="material-icons text-pink-500">favorite</span>
                            Meeting With
                        </h3>

                        {meetingProfile ? (
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-gray-700 overflow-hidden border-2 border-pink-500/50">
                                    {meetingProfile.photo ? (
                                        <img src={meetingProfile.photo} alt={meetingProfile.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-gradient-to-br from-pink-500 to-purple-600">
                                            {meetingProfile.name.charAt(0)}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-bold text-xl">{meetingProfile.name}</h4>
                                    <p className="text-xs text-gray-400">Profile details attached to alerts</p>
                                    <button
                                        onClick={() => setMeetingProfile(null)}
                                        className="text-xs text-red-400 hover:text-red-300 mt-1 flex items-center gap-1"
                                    >
                                        <span className="material-icons text-xs">edit</span> Change
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="Who are you meeting? (Name)"
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:border-pink-500 focus:outline-none"
                                    onChange={(e) => setMeetingProfile({ name: e.target.value, photo: null })}
                                />
                                <p className="text-xs text-gray-500">
                                    <span className="text-pink-400">*</span> Enter name to include in safety alerts
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ===== ACTIVE STATE: Timer + Location ===== */}
                    {isActive ? (
                        <>
                            {/* Timer */}
                            <div className="text-center py-4">
                                <h2 className="text-gray-400 uppercase tracking-widest text-sm mb-3">Time Until Check-In</h2>
                                <div className="text-6xl font-mono font-bold text-white tabular-nums drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
                                    {formatTime(timeLeft)}
                                </div>
                                <p className="text-gray-500 mt-3 text-sm">
                                    Alerting: <span className="text-white font-bold">{contacts.map(c => c.name).join(', ')}</span>
                                </p>
                            </div>

                            {/* Live Location Card */}
                            <div className="bg-gray-800/80 backdrop-blur p-5 rounded-2xl border border-gray-700">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <span className="material-icons text-green-400">my_location</span>
                                        Live Location
                                    </h3>
                                    {isTracking && (
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                            <span className="text-green-400 text-xs font-medium">TRACKING</span>
                                        </div>
                                    )}
                                </div>
                                {location ? (
                                    <div className="space-y-2">
                                        <div className="bg-gray-900/60 rounded-lg p-3 font-mono text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Lat</span>
                                                <span className="text-green-300">{location.lat.toFixed(6)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Lng</span>
                                                <span className="text-green-300">{location.lng.toFixed(6)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Accuracy</span>
                                                <span className="text-yellow-300">±{Math.round(location.accuracy)}m</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <a
                                                href={getGoogleMapsLink(location.lat, location.lng)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg py-2 text-center text-sm font-medium flex items-center justify-center gap-1"
                                            >
                                                <span className="material-icons text-sm">map</span>
                                                Open Maps
                                            </a>
                                            <button
                                                onClick={shareLocation}
                                                className="flex-1 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1"
                                            >
                                                <span className="material-icons text-sm">share</span>
                                                Share Link
                                            </button>
                                        </div>
                                    </div>
                                ) : locationError ? (
                                    <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
                                        <span className="material-icons text-sm">error</span>
                                        {locationError}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center gap-2 py-4 text-gray-400 text-sm">
                                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                                        Acquiring GPS signal...
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        /* ===== SETUP STATE: Contacts + Duration ===== */
                        <>
                            {/* Trusted Contacts */}
                            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <span className="material-icons text-purple-400">contact_phone</span>
                                        Trusted Contacts
                                    </h3>
                                    <span className="text-xs text-gray-500">{contacts.length}/3</span>
                                </div>
                                <div className="space-y-3">
                                    {contacts.map((contact, idx) => (
                                        <div key={idx} className="flex gap-2 items-start">
                                            <div className="flex-1 space-y-2">
                                                <input
                                                    type="text"
                                                    value={contact.name}
                                                    onChange={(e) => updateContact(idx, 'name', e.target.value)}
                                                    onBlur={() => handleContactBlur(idx)}
                                                    placeholder="Name (e.g. Mom)"
                                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                                                />
                                                <input
                                                    type="tel"
                                                    value={contact.phone}
                                                    onChange={(e) => updateContact(idx, 'phone', e.target.value)}
                                                    onBlur={() => handleContactBlur(idx)}
                                                    placeholder="Phone Number"
                                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
                                                />
                                            </div>
                                            {contacts.length > 1 && (
                                                <button
                                                    onClick={() => removeContact(idx)}
                                                    className="mt-2 text-gray-500 hover:text-red-400 transition-colors"
                                                >
                                                    <span className="material-icons text-sm">close</span>
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {contacts.length < 3 && (
                                        <button
                                            onClick={addContact}
                                            className="w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:border-purple-500 hover:text-purple-400 transition-colors flex items-center justify-center gap-1"
                                        >
                                            <span className="material-icons text-sm">add</span>
                                            Add Contact
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                                    <span className="material-icons text-xs">save</span>
                                    Contacts are saved automatically
                                </p>
                            </div>

                            {/* Duration Selector */}
                            <div className="bg-gray-800 p-5 rounded-2xl border border-gray-700">
                                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                    <span className="material-icons text-purple-400">timer</span>
                                    Check-In Duration
                                </h3>
                                <input
                                    type="range"
                                    min="15"
                                    max="240"
                                    step="15"
                                    value={duration}
                                    onChange={(e) => setDuration(parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <div className="text-center mt-2 font-bold text-2xl text-purple-400">
                                    {Math.floor(duration / 60)}h {duration % 60}m
                                </div>
                            </div>
                        </>
                    )}

                    {/* ===== EMERGENCY SERVICES CARD (always visible) ===== */}
                    <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 p-5 rounded-2xl border border-red-500/30">
                        <h3 className="font-bold mb-3 flex items-center gap-2 text-red-300">
                            <span className="material-icons">local_hospital</span>
                            Emergency Services
                        </h3>
                        <a
                            href={`tel:${emergencyNumber.number}`}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-900/40 active:scale-95 transition-all"
                        >
                            <span className="material-icons">call</span>
                            Call {emergencyNumber.label}
                        </a>
                        <p className="text-xs text-gray-400 mt-2 text-center">
                            {location ? '📍 Number detected from your location' : 'Default: 911 (US) — enable GPS for auto-detection'}
                        </p>
                    </div>

                    {/* ===== ACTION BUTTONS ===== */}
                    <div className="flex flex-col items-center gap-4 pt-2">
                        {/* Main Action Button */}
                        <button
                            onClick={isActive ? stopTimer : startTimer}
                            className={`w-full max-w-xs py-5 rounded-full font-bold text-lg shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${isActive
                                ? 'bg-gray-700 text-white border border-gray-500'
                                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-purple-900/50'
                                }`}
                        >
                            <span className="material-icons">{isActive ? 'check_circle' : 'play_arrow'}</span>
                            {isActive ? "I'M SAFE (STOP)" : 'START DATE GUARD'}
                        </button>

                        {/* Panic Button */}
                        <button
                            onClick={handlePanic}
                            className="w-full max-w-xs py-5 rounded-xl bg-gradient-to-r from-red-600/20 to-orange-600/20 border-2 border-red-500 text-red-500 font-bold hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] animate-pulse"
                        >
                            <span className="material-icons text-2xl">notifications_active</span>
                            <span className="text-xl tracking-wider">PANIC BUTTON</span>
                        </button>

                        <p className="text-xs text-gray-500 text-center max-w-xs">
                            Panic sends your <strong>live GPS location</strong> to all trusted contacts and shows emergency call options.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
