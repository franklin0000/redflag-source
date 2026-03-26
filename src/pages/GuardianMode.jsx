import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
    watchLocation,
    getGoogleMapsLink,
    isGeolocationSupported,
} from '../services/locationService';
import {
    createGuardianSession,
    updateGuardianLocation,
    checkInSafe,
    markTense,
    triggerSOS,
    cancelSOS,
    endGuardianSession,
} from '../services/guardianService';
// ── Screen Wake Lock ────────────────────────────────────────────────────────────────────────────
// Keeps the screen awake during an active session so GPS stays alive on iOS/Android.
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return null;
    try {
        return await navigator.wakeLock.request('screen');
    } catch {
        return null; // Denied (e.g. low battery mode) — degrade gracefully
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const CHECK_IN_OPTIONS = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '1 hour', value: 60 },
];
export default function GuardianMode() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();

    // ── State machine: setup | active | ended ────────────────────────────────────────────
    const [phase, setPhase] = useState('setup');

    // Setup form
    const [daterName, setDaterName] = useState(user?.name || user?.email?.split('@')[0] || '');
    const [dateLocation, setDateLocation] = useState('');
    const [checkInMinutes, setCheckInMinutes] = useState(30);
    const [starting, setStarting] = useState(false);

    // Active session
    const [session, setSession] = useState(null);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [timeLeftSecs, setTimeLeftSecs] = useState(0);
    const [isSOS, setIsSOS] = useState(false);
    const [holdProgress, setHoldProgress] = useState(0);     // 0-100, SOS hold button
    const [autoSosCountdown, setAutoSosCountdown] = useState(null); // seconds until auto-SOS
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [endConfirm, setEndConfirm] = useState(false);

    // Refs — mutable values that don't need to trigger re-renders
    const stopWatchRef    = useRef(null);  // GPS watcher cleanup
    const locationPushRef = useRef(null);  // interval ID for DB location push
    const checkInTimerRef = useRef(null);  // interval ID for check-in countdown
    const autoSosRef      = useRef(null);  // interval ID for auto-SOS countdown
    const holdTimerRef    = useRef(null);  // interval ID for hold-to-SOS progress
    const sessionRef      = useRef(null);  // stable ref to avoid stale closures
    const locationRef     = useRef(null);  // stable ref to latest GPS coords
    const wakeLockRef     = useRef(null);  // Screen Wake Lock sentinel

    // Keep refs in sync with state
    useEffect(() => { sessionRef.current = session; }, [session]);
    useEffect(() => { locationRef.current = location; }, [location]);

    // Derived — defined early so effects below can reference them
    const overdue = timeLeftSecs === 0 && phase === 'active';
    const pct = session ? Math.round((timeLeftSecs / (checkInMinutes * 60)) * 100) : 100;
    // ── Network status ────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const goOnline  = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener('online',  goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online',  goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    // ── Start session ────────────────────────────────────────────────────────────────────────────
    const handleStart = async () => {
        if (!user?.id) { toast.error('You must be logged in.'); return; }
        if (!daterName.trim()) { toast.error('Please enter your name.'); return; }
        setStarting(true);
        try {
            const sess = await createGuardianSession(
                user.id, daterName.trim(), checkInMinutes, dateLocation.trim()
            );
            setSession(sess);
            setTimeLeftSecs(checkInMinutes * 60);
            setPhase('active');
            startCheckInTimer(sess.id, checkInMinutes * 60);
            // Prevent screen sleep so GPS stays alive (iOS/Android PWA)
            requestWakeLock().then(lock => { wakeLockRef.current = lock; });
            toast.success('Guardian session started!');
        } catch (e) {
            toast.error('Failed to start session: ' + e.message);
        } finally {
            setStarting(false);
        }
    };
    // ── GPS watch — started when session becomes active ───────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'active' || !isGeolocationSupported()) return;
        stopWatchRef.current = watchLocation(
            (coords) => { setLocation(coords); setLocationError(''); },
            (err)    => setLocationError(err.message || 'Location denied'),
        );
        return () => {
            stopWatchRef.current?.();
            stopWatchRef.current = null;
        };
    }, [phase]);

    // ── Wake Lock re-acquisition on tab visibility ────────────────────────────────────────────
    // The OS releases the wake lock when the tab is hidden. Re-acquire it when
    // the user returns so GPS stays active for the rest of the session.
    useEffect(() => {
        if (phase !== 'active') return;
        const handleVisibility = async () => {
            if (
                document.visibilityState === 'visible' &&
                (!wakeLockRef.current || wakeLockRef.current.released)
            ) {
                wakeLockRef.current = await requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [phase]);

    // ── Location push — 10 s during SOS, 30 s otherwise ─────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'active' || !session) return;
        const intervalMs = isSOS ? 10_000 : 30_000;
        const id = setInterval(() => {
            if (locationRef.current) {
                updateGuardianLocation(
                    session.id,
                    locationRef.current.lat,
                    locationRef.current.lng,
                ).catch(() => {});
            }
        }, intervalMs);
        locationPushRef.current = id;
        return () => clearInterval(id);
    }, [phase, session, isSOS]);
    // ── Check-in countdown ───────────────────────────────────────────────────────────────────────────
    const startCheckInTimer = useCallback((sessionId, totalSecs) => {
        clearInterval(checkInTimerRef.current);
        setTimeLeftSecs(totalSecs);
        checkInTimerRef.current = setInterval(() => {
            setTimeLeftSecs(prev => {
                if (prev <= 1) {
                    clearInterval(checkInTimerRef.current); // stop firing at 0
                    markTense(sessionId).catch(() => {});
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    // ── Auto-SOS countdown — fires 60 s after check-in overdue ───────────────────────────────────────────
    // When the check-in timer expires and the user hasn't responded, a 60-second
    // countdown begins. If still no action, SOS is sent automatically.
    // Cancelled by check-in, manual SOS, or session end.
    useEffect(() => {
        if (!overdue || isSOS) {
            clearInterval(autoSosRef.current);
            setAutoSosCountdown(null);
            return;
        }
        setAutoSosCountdown(60);
        autoSosRef.current = setInterval(() => {
            setAutoSosCountdown(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(autoSosRef.current);
                    const sess = sessionRef.current;
                    const loc  = locationRef.current;
                    if (sess) {
                        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
                        triggerSOS(sess.id).catch(() => {
                            const mapsLink = loc
                                ? `https://maps.google.com/?q=${loc.lat},${loc.lng}`
                                : 'Location unavailable';
                            const body = encodeURIComponent(
                                `🚨 EMERGENCY — I need help! RedFlag SOS
📍 ${mapsLink}`
                            );
                            window.location.href = `sms:?body=${body}`;
                        });
                        setIsSOS(true);
                    }
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(autoSosRef.current);
    }, [overdue, isSOS]); // sessionRef, locationRef, setIsSOS are stable refs/setters
    // ── "I'm Safe" ────────────────────────────────────────────────────────────────────────────
    const handleCheckIn = async () => {
        if (!session) return;
        try {
            await checkInSafe(session.id);
            setIsSOS(false);
            clearInterval(autoSosRef.current);
            setAutoSosCountdown(null);
            clearInterval(checkInTimerRef.current);
            startCheckInTimer(session.id, checkInMinutes * 60);
            toast.success("Check-in confirmed — guardian notified you're safe!");
        } catch {
            toast.error('Check-in failed. Try again.');
        }
    };

    // ── SOS ──────────────────────────────────────────────────────────────────────────────────────
    const handleSOS = async () => {
        if (!session) return;
        clearInterval(autoSosRef.current);
        setAutoSosCountdown(null);
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);

        try {
            await triggerSOS(session.id);
            setIsSOS(true);
            toast.error('🚨 SOS sent to your guardian!');
        } catch {
            setIsSOS(true);
            const mapsLink = locationRef.current
                ? `https://maps.google.com/?q=${locationRef.current.lat},${locationRef.current.lng}`
                : 'Location unavailable';
            const body = encodeURIComponent(
                `🚨 EMERGENCY — I need help! RedFlag SOS
📍 ${mapsLink}`
            );
            window.location.href = `sms:?body=${body}`;
            toast.error('🚨 Network unavailable — SMS app opened as fallback.');
        }
    };

    const handleCancelSOS = async () => {
        if (!session) return;
        try {
            await cancelSOS(session.id);
            setIsSOS(false);
            clearInterval(autoSosRef.current);
            setAutoSosCountdown(null);
            if (navigator.vibrate) navigator.vibrate(0);
            toast.success("SOS cancelled — guardian notified you're safe.");
            clearInterval(checkInTimerRef.current);
            startCheckInTimer(session.id, checkInMinutes * 60);
        } catch {
            toast.error('Cancel failed.');
        }
    };
    // ── Hold-to-SOS ────────────────────────────────────────────────────────────────────────────────────
    // The user must hold the SOS button for 2 seconds to fire, preventing
    // accidental triggers. A fill animation tracks hold progress (5% per 100 ms).
    const handleSOSHoldStart = () => {
        if (isSOS) return;
        let progress = 0;
        holdTimerRef.current = setInterval(() => {
            progress += 5; // 100 ms x 20 steps = 2 s
            setHoldProgress(progress);
            if (progress >= 100) {
                clearInterval(holdTimerRef.current);
                setHoldProgress(0);
                handleSOS();
            }
        }, 100);
    };

    const handleSOSHoldEnd = () => {
        clearInterval(holdTimerRef.current);
        setHoldProgress(0);
    };

    // ── Share guardian link ────────────────────────────────────────────────────────────────────────────
    const guardianUrl = session
        ? `${window.location.origin}/guardian/${session.session_token}`
        : '';

    const handleShare = async () => {
        const text = `🛡️ ${daterName} has activated Guardian Mode on RedFlag.
Watch their safety live: ${guardianUrl}`;
        if (navigator.share) {
            await navigator.share({ title: 'Watch my date safety', text, url: guardianUrl });
        } else {
            await navigator.clipboard.writeText(text);
            toast.success('Guardian link copied to clipboard!');
        }
    };

    const handleShareWhatsApp = () => {
        const msg = encodeURIComponent(
            `🛡️ ${daterName} has activated Guardian Mode on RedFlag.
I'm going on a date — please watch my safety live:
${guardianUrl}`
        );
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    };
    // ── End session ────────────────────────────────────────────────────────────────────────────
    const handleEndRequest = () => setEndConfirm(true);

    const handleEndConfirmed = useCallback(async () => {
        setEndConfirm(false);
        if (!session) return;
        clearInterval(autoSosRef.current);
        clearInterval(holdTimerRef.current);
        setHoldProgress(0);
        try { await endGuardianSession(session.id); } catch { /* best-effort */ }
        setPhase('ended');
        clearInterval(checkInTimerRef.current);
        clearInterval(locationPushRef.current);
        stopWatchRef.current?.();
        wakeLockRef.current?.release().catch(() => {});
        if (navigator.vibrate) navigator.vibrate(0);
    }, [session]);

    // ── Cleanup on unmount ───────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            clearInterval(checkInTimerRef.current);
            clearInterval(locationPushRef.current);
            clearInterval(autoSosRef.current);
            clearInterval(holdTimerRef.current);
            stopWatchRef.current?.();
            wakeLockRef.current?.release().catch(() => {});
        };
    }, []);
    // ── Render: SETUP ────────────────────────────────────────────────────────────────────────────
    if (phase === 'setup') {
        return (
            <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100">
                <header className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-lg border-b border-gray-200 dark:border-white/5">
                    <div className="flex items-center gap-3 px-4 py-4">
                        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                            <span className="material-icons">chevron_left</span>
                        </button>
                        <div className="flex-1">
                            <h1 className="text-lg font-bold">Guardian Mode</h1>
                            <p className="text-xs text-gray-400">Let a trusted person watch your date in real-time</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="material-icons text-primary">shield</span>
                        </div>
                    </div>
                </header>

                <main className="px-4 py-6 space-y-5 max-w-md mx-auto pb-24">
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
                        <p className="text-sm font-bold text-primary flex items-center gap-2">
                            <span className="material-icons text-base">info</span>
                            How Guardian Mode works
                        </p>
                        {[
                            ['my_location', 'Your GPS is shared with your guardian every 30 seconds'],
                            ['notifications_active', 'If you stop checking in, your guardian gets a warning'],
                            ['sos', 'Hold the SOS button 2 seconds to immediately alert them'],
                        ].map(([icon, text]) => (
                            <div key={icon} className="flex items-start gap-2.5">
                                <span className="material-icons text-primary text-sm mt-0.5">{icon}</span>
                                <p className="text-xs text-gray-600 dark:text-gray-300">{text}</p>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white dark:bg-[#1a202c] rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                        <div className="p-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Your Name</label>
                            <input
                                value={daterName}
                                onChange={e => setDaterName(e.target.value)}
                                placeholder="How your guardian will see you"
                                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                            />
                        </div>                        <div className="p-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Date Venue <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                            <input
                                value={dateLocation}
                                onChange={e => setDateLocation(e.target.value)}
                                placeholder="e.g. Cafe Luna, 5th Ave"
                                className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary transition-colors"
                            />
                        </div>                        <div className="p-4">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-3">Check-in interval</label>
                            <div className="flex gap-2">
                                {CHECK_IN_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setCheckInMinutes(opt.value)}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${checkInMinutes === opt.value
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-2">If you don't check in within this time, your guardian gets a warning.</p>
                        </div>
                    </div>

                    <button
                        onClick={handleStart}
                        disabled={starting || !daterName.trim()}
                        className="w-full py-4 rounded-2xl bg-primary text-white font-bold text-base shadow-lg shadow-primary/25 disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {starting
                            ? <><div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Starting...</>
                            : <><span className="material-icons">shield</span> Start Guardian Session</>
                        }
                    </button>
                </main>
            </div>
        );
    }

    if (phase === 'ended') {
        return (
            <div className="bg-background-light dark:bg-background-dark min-h-screen font-display flex flex-col items-center justify-center p-8 text-center gap-6">
                <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center">
                    <span className="material-icons text-green-500 text-5xl">check_circle</span>
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Session Ended</h2>
                    <p className="text-gray-500 mt-2 text-sm">You're safe. Your guardian session has been closed.</p>
                </div>
                <button
                    onClick={() => navigate('/dating/checkin')}
                    className="px-8 py-3 rounded-2xl bg-primary text-white font-semibold"
                >
                    Back to Safety
                </button>
            </div>
        );
    }

    // ── Render: ACTIVE ───────────────────────────────────────────────────────────────────────────
    const sentimentLabel = isSOS ? '🔴 SOS Active' : overdue ? '🟡 Check-in overdue' : '🟢 Safe';

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100">
            <header className={`sticky top-0 z-30 backdrop-blur-lg border-b border-gray-200 dark:border-white/5 ${isSOS ? 'bg-red-500' : 'bg-background-light/90 dark:bg-background-dark/90'}`}>
                <div className="flex items-center gap-3 px-4 py-4">
                    <button onClick={() => navigate(-1)} className={`p-1.5 rounded-full transition-colors ${isSOS ? 'hover:bg-white/20 text-white' : 'hover:bg-gray-200 dark:hover:bg-white/10'}`}>
                        <span className="material-icons">chevron_left</span>
                    </button>
                    <div className="flex-1">
                        <h1 className={`text-lg font-bold ${isSOS ? 'text-white' : ''}`}>
                            {isSOS ? '🚨 SOS ACTIVE' : '🛡️ Guardian Mode'}
                        </h1>
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isSOS ? 'bg-white' : overdue ? 'bg-yellow-400' : 'bg-green-400'}`} />
                            <p className={`text-xs font-medium ${isSOS ? 'text-white/80' : 'text-gray-400'}`}>{sentimentLabel}</p>
                        </div>
                    </div>
                    <button onClick={handleShare} className={`p-2 rounded-full transition-colors ${isSOS ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300'}`}>
                        <span className="material-icons text-lg">share</span>
                    </button>
                </div>
            </header>

            <main className="px-4 py-5 space-y-4 max-w-md mx-auto pb-32">

                {isOffline && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-center gap-2">
                        <span className="material-icons text-amber-500 text-lg">wifi_off</span>
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            No internet — SOS will open SMS as fallback
                        </p>
                    </div>
                )}

                {isSOS && (
                    <div className="bg-red-500 rounded-2xl p-5 text-white text-center space-y-3 animate-pulse">
                        <span className="material-icons text-5xl">sos</span>
                        <p className="font-bold text-lg">SOS Signal Active</p>
                        <p className="text-sm text-red-100">Your guardian is watching your location. Stay calm.</p>
                        <button
                            onClick={handleCancelSOS}
                            className="w-full py-3 rounded-xl bg-white text-red-600 font-bold text-sm"
                        >
                            I'M SAFE — Cancel SOS
                        </button>
                    </div>
                )}

                <div className="bg-white dark:bg-[#1a202c] rounded-2xl border border-gray-100 dark:border-gray-800 p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Guardian Link</p>
                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 flex items-center gap-2">
                        <span className="material-icons text-primary text-sm">link</span>
                        <p className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate flex-1">{guardianUrl}</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleShare}
                            className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-white/10 text-sm font-semibold flex items-center justify-center gap-1.5"
                        >
                            <span className="material-icons text-base">content_copy</span>
                            Copy Link
                        </button>
                        <button
                            onClick={handleShareWhatsApp}
                            className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                        >
                            <span className="material-icons text-base">chat</span>
                            WhatsApp
                        </button>
                    </div>
                </div>

                <div className={`rounded-2xl border p-4 ${overdue ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-300 dark:border-yellow-500/30' : 'bg-white dark:bg-[#1a202c] border-gray-100 dark:border-gray-800'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Check-in</p>
                        <span className={`text-2xl font-mono font-bold ${overdue ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
                            {overdue ? 'OVERDUE' : formatTime(timeLeftSecs)}
                        </span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden mb-3">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${overdue ? 'bg-yellow-400 w-full' : pct > 50 ? 'bg-green-400' : pct > 20 ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: overdue ? '100%' : `${pct}%` }}
                        />
                    </div>
                    {overdue && autoSosCountdown !== null && (
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-red-500/10 rounded-xl border border-red-500/20">
                            <span className="material-icons text-red-500 text-base animate-pulse">warning</span>
                            <p className="text-xs font-bold text-red-600 dark:text-red-400">
                                Auto-SOS in {autoSosCountdown}s — tap &quot;I'm Safe&quot; to cancel
                            </p>
                        </div>
                    )}
                    <button
                        onClick={handleCheckIn}
                        className="w-full py-3.5 rounded-xl bg-green-500 text-white font-bold text-base shadow-lg shadow-green-500/25 hover:bg-green-600 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-icons">check_circle</span>
                        I'm Safe
                    </button>
                </div>

                <div className="bg-white dark:bg-[#1a202c] rounded-2xl border border-gray-100 dark:border-gray-800 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Your Location</p>
                    {location ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                    <span className="text-sm text-gray-600 dark:text-gray-300">GPS active</span>
                                </div>
                                {location.accuracy && (
                                    <span className="text-xs text-gray-400 font-mono">
                                        ±{Math.round(location.accuracy)}m
                                    </span>
                                )}
                            </div>
                            {session?.date_location && (
                                <p className="text-sm font-medium">📍 {session.date_location}</p>
                            )}
                            <a
                                href={getGoogleMapsLink(location.lat, location.lng)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-primary font-medium"
                            >
                                <span className="material-icons text-base">map</span>
                                Open in Google Maps
                            </a>
                        </div>
                    ) : locationError ? (
                        <p className="text-sm text-red-500">{locationError}</p>
                    ) : (
                        <p className="text-sm text-gray-400">Acquiring GPS...</p>
                    )}
                </div>

                {!isSOS && (
                    <button
                        onPointerDown={handleSOSHoldStart}
                        onPointerUp={handleSOSHoldEnd}
                        onPointerLeave={handleSOSHoldEnd}
                        className="w-full py-5 rounded-2xl bg-red-500 text-white font-black text-xl shadow-2xl shadow-red-500/30 overflow-hidden relative select-none"
                        style={{ touchAction: 'none' }}
                    >
                        <div
                            className="absolute inset-0 bg-red-700 origin-left"
                            style={{ transform: `scaleX(${holdProgress / 100})`, transition: holdProgress === 0 ? 'none' : 'transform 100ms linear' }}
                        />
                        <span className="relative flex items-center justify-center gap-3 pointer-events-none">
                            <span className="material-icons text-3xl">sos</span>
                            {holdProgress > 0
                                ? `Hold... ${Math.round(holdProgress)}%`
                                : 'HOLD TO SEND SOS'
                            }
                        </span>
                    </button>
                )}

                {endConfirm ? (
                    <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3 text-center">
                        <p className="font-semibold text-gray-800 dark:text-white text-sm">End guardian session?</p>
                        <p className="text-xs text-gray-500">Your guardian will be notified the session has ended.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEndConfirm(false)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold"
                            >
                                Keep Active
                            </button>
                            <button
                                onClick={handleEndConfirmed}
                                className="flex-1 py-2.5 rounded-xl bg-gray-700 text-white text-sm font-bold"
                            >
                                End Session
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={handleEndRequest}
                        className="w-full py-3 rounded-xl text-sm font-medium text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                        End Session
                    </button>
                )}
            </main>
        </div>
    );
}
