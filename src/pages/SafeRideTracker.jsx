import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { safeRideService } from '../services/safeRideService';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MAPBOX_STYLE  = 'mapbox://styles/mapbox/dark-v11';

export default function SafeRideTracker() {
    const { sessionId } = useParams();
    const navigate      = useNavigate();
    const { user }      = useAuth();
    const toast         = useToast();

    const [ride,         setRide]         = useState(null);
    const [loading,      setLoading]      = useState(true);
    const [pickupInput,  setPickupInput]  = useState('');
    const [pickupCoords, setPickupCoords] = useState(null); // { lat, lng, address }
    const [geocoding,    setGeocoding]    = useState(false);
    const [viewState,    setViewState]    = useState({ longitude: -74.006, latitude: 40.7128, zoom: 14 });

    const mapRef      = useRef(null);
    const gpsCleanup  = useRef(null);

    // ── Load + subscribe ──────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;

        safeRideService.getRide(sessionId)
            .then(data => { if (mounted) { setRide(data); setLoading(false); } })
            .catch(() => { if (mounted) setLoading(false); });

        const unsub = safeRideService.subscribeToRide(sessionId, (updated) => {
            if (!mounted) return;
            setRide(updated);
            if (updated.status === 'arrived') toast.success('SafeRide completado! +10 $RFLAG 🪙');
        });

        return () => { mounted = false; unsub(); };
    }, [sessionId, toast]);

    const isSender = ride?.sender_id === user?.id;

    // ── Auto-fit map bounds ───────────────────────────────────────────────
    useEffect(() => {
        if (!ride || !mapRef.current) return;

        const lats = [ride.dest_lat, ride.pickup_lat, ride.receiver_lat, ride.car_lat].filter(Boolean);
        const lngs = [ride.dest_lng, ride.pickup_lng, ride.receiver_lng, ride.car_lng].filter(Boolean);
        if (lats.length < 2) return;

        const pad = 0.01;
        try {
            mapRef.current.fitBounds(
                [[Math.min(...lngs) - pad, Math.min(...lats) - pad],
                 [Math.max(...lngs) + pad, Math.max(...lats) + pad]],
                { padding: 60, duration: 800 }
            );
        } catch { /* map not ready yet */ }
    }, [ride]);

    // ── GPS sharing: receiver starts sharing when en_route ────────────────
    useEffect(() => {
        if (isSender || ride?.status !== 'en_route') return;

        // Start sharing GPS
        gpsCleanup.current = safeRideService.startGpsSharing(sessionId);
        return () => { gpsCleanup.current?.(); };
    }, [isSender, ride?.status, sessionId]);

    // ── Geocode pickup address ────────────────────────────────────────────
    const handleGeocode = async (e) => {
        e.preventDefault();
        if (!pickupInput.trim()) return;
        setGeocoding(true);
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(pickupInput)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
            const res  = await fetch(url);
            const data = await res.json();

            if (!data.features?.length) {
                toast.error('Address not found. Try a more specific address.');
                return;
            }

            const feature = data.features[0];
            const coords  = { lat: feature.center[1], lng: feature.center[0], address: feature.place_name };
            setPickupCoords(coords);

            await safeRideService.acceptRide(sessionId, coords.address, coords.lat, coords.lng);
            toast.success('Pickup location confirmed!');
        } catch (err) {
            toast.error('Geocoding failed. Check your address.');
            console.error(err);
        } finally {
            setGeocoding(false);
        }
    };

    // ── Open Uber with pre-filled pickup + destination ────────────────────
    const handleOpenUber = () => {
        const pCoords = pickupCoords || (ride?.pickup_lat ? { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address } : null);
        if (!pCoords || !ride) return;

        const webUrl = safeRideService.getUberDeepLink(
            pCoords.lat, pCoords.lng, pCoords.address,
            ride.dest_lat, ride.dest_lng, ride.dest_name, ride.dest_address
        );

        // Native URI scheme — opens the installed Uber app with info pre-filled
        // (same params as the web URL, just different scheme prefix)
        const nativeUrl = webUrl.replace('https://m.uber.com/ul/', 'uber://');

        safeRideService.confirmUberOpened(sessionId);
        toast.success('Opening Uber...');

        // Strategy: try native app first; if page loses focus the app opened.
        // If still focused after 1.2s, Uber not installed → open web fallback.
        let appOpened = false;
        const onBlur = () => { appOpened = true; };
        window.addEventListener('blur', onBlur, { once: true });

        window.location.href = nativeUrl;

        setTimeout(() => {
            window.removeEventListener('blur', onBlur);
            if (!appOpened) window.open(webUrl, '_blank', 'noopener');
        }, 1200);
    };

    // ── Loading / not found ───────────────────────────────────────────────
    if (loading) return (
        <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin mr-3" />
            Loading SafeRide...
        </div>
    );
    if (!ride) return (
        <div className="h-screen bg-gray-900 text-white flex items-center justify-center flex-col gap-5 p-6 text-center">
            <span className="material-icons text-5xl text-gray-600">local_taxi</span>
            <div>
                <h2 className="font-bold text-xl mb-2">SafeRide not found</h2>
                <p className="text-gray-400 text-sm mb-1">This ride session may have expired or the invite was sent before an app update.</p>
                <p className="text-gray-500 text-xs">Ask your match to send a new SafeRide invite.</p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                    onClick={() => window.location.reload()}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl flex items-center justify-center gap-2"
                >
                    <span className="material-icons text-sm">refresh</span> Retry
                </button>
                <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white underline text-sm">Go back</button>
            </div>
        </div>
    );

    const showPickupForm  = !isSender && ride.status === 'requested';
    // Show Uber button if pickup is ready — use local coords OR coords saved in DB
    const pickupForUber   = pickupCoords || (ride.pickup_lat ? { lat: ride.pickup_lat, lng: ride.pickup_lng, address: ride.pickup_address } : null);
    const showUberButton  = !isSender && ride.status === 'pickup_ready' && pickupForUber;
    const showWaiting     = isSender  && (ride.status === 'requested' || ride.status === 'pickup_ready');

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white relative">

            {/* ── Header ── */}
            <div className="absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-gray-900/95 to-transparent p-4 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="p-2 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-md">
                    <span className="material-icons text-white">arrow_back</span>
                </button>
                <div className="flex flex-col items-center">
                    <h1 className="text-xl font-bold tracking-widest text-white flex items-center gap-2">
                        <span className="material-icons text-blue-400">local_taxi</span>
                        SAFERIDE
                    </h1>
                    <p className="text-xs text-gray-400">
                        {ride.status === 'requested' && 'Waiting for pickup address…'}
                        {ride.status === 'pickup_ready' && 'Ready to open Uber'}
                        {ride.status === 'en_route' && '🟢 Ride in progress'}
                        {ride.status === 'arrived'  && '✅ Arrived!'}
                    </p>
                </div>
                <div className="w-10" />
            </div>

            {/* ── Pickup form (receiver, step 1) ── */}
            {showPickupForm && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-black z-20">
                    <div className="bg-gray-800 p-8 rounded-3xl w-full max-w-sm border border-gray-700 shadow-xl">
                        <div className="flex items-center justify-center w-16 h-16 bg-blue-900/40 rounded-full mx-auto mb-4">
                            <span className="material-icons text-blue-400 text-3xl">my_location</span>
                        </div>
                        <h2 className="text-2xl font-bold text-center mb-1">Enter Pickup</h2>
                        <p className="text-sm text-gray-400 text-center mb-6">
                            Your match paid for your Uber!<br />
                            <strong className="text-green-400">Your address is NEVER shared</strong> with them.
                        </p>

                        <form onSubmit={handleGeocode} className="flex flex-col gap-4">
                            <div>
                                <label className="text-xs text-gray-400 font-bold ml-1 mb-1 block">Your pickup address</label>
                                <input
                                    type="text"
                                    value={pickupInput}
                                    onChange={e => setPickupInput(e.target.value)}
                                    placeholder="e.g. 123 Main St, Brooklyn NY"
                                    className="w-full bg-gray-900 border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                                    required
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={geocoding}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {geocoding
                                    ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Finding…</>
                                    : <><span className="material-icons text-sm">search</span> Confirm Address</>
                                }
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Open Uber button (receiver, step 2) ── */}
            {showUberButton && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-black z-20">
                    <div className="bg-gray-800 p-8 rounded-3xl w-full max-w-sm border border-gray-700 shadow-xl text-center">
                        <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-gray-600">
                            <span className="material-icons text-white text-4xl">local_taxi</span>
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Ready to Ride!</h2>

                        <div className="bg-gray-900 rounded-2xl p-4 mb-6 text-left">
                            <div className="flex items-start gap-3 mb-3">
                                <span className="material-icons text-blue-400 text-lg mt-0.5">trip_origin</span>
                                <div>
                                    <p className="text-xs text-gray-500 font-bold uppercase">Pickup</p>
                                    <p className="text-sm text-white">{pickupForUber?.address}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <span className="material-icons text-yellow-400 text-lg mt-0.5">place</span>
                                <div>
                                    <p className="text-xs text-gray-500 font-bold uppercase">Destination</p>
                                    <p className="text-sm text-white">{ride.dest_name}</p>
                                    <p className="text-xs text-gray-500">{ride.dest_address}</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleOpenUber}
                            className="w-full py-4 bg-black text-white font-bold rounded-xl border-2 border-white hover:bg-gray-900 transition-colors flex items-center justify-center gap-3 text-lg"
                        >
                            <span className="material-icons">open_in_new</span>
                            Open Uber
                        </button>
                        <p className="text-xs text-gray-500 mt-3">
                            Uber app opens with your ride pre-filled. Complete booking there.
                        </p>

                        {/* Change address option */}
                        <button
                            onClick={() => { setPickupCoords(null); setPickupInput(''); safeRideService.resetPickup(sessionId).catch(() => {}); }}
                            className="mt-4 text-xs text-gray-500 hover:text-gray-300 underline"
                        >
                            Change pickup address
                        </button>
                    </div>
                </div>
            )}

            {/* ── Map (sender always; receiver when en_route or arrived) ── */}
            {!showPickupForm && !showUberButton && (
                <div className="flex-1 w-full relative">
                    {!MAPBOX_TOKEN ? (
                        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-400">
                            Map unavailable (Mapbox token missing)
                        </div>
                    ) : (
                        <Map
                            ref={mapRef}
                            {...viewState}
                            onMove={evt => setViewState(evt.viewState)}
                            mapStyle={MAPBOX_STYLE}
                            mapboxAccessToken={MAPBOX_TOKEN}
                            style={{ width: '100%', height: '100%' }}
                        >
                            {/* Destination */}
                            {ride.dest_lat && ride.dest_lng && (
                                <Marker longitude={ride.dest_lng} latitude={ride.dest_lat} anchor="bottom">
                                    <div className="flex flex-col items-center">
                                        <div className="bg-yellow-400 text-black text-xs font-bold px-2 py-0.5 rounded-full mb-1 shadow">
                                            {ride.dest_name}
                                        </div>
                                        <span className="material-icons text-yellow-400 text-3xl drop-shadow-lg">place</span>
                                    </div>
                                </Marker>
                            )}

                            {/* Receiver live location (blue dot) */}
                            {ride.receiver_lat && ride.receiver_lng && (
                                <Marker longitude={ride.receiver_lng} latitude={ride.receiver_lat} anchor="center">
                                    <div className="relative">
                                        <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-lg" />
                                        <div className="absolute inset-0 w-5 h-5 bg-blue-500 rounded-full opacity-40 animate-ping" />
                                    </div>
                                </Marker>
                            )}

                            {/* Car marker (if set) */}
                            {ride.car_lat && ride.car_lng && ride.status === 'en_route' && (
                                <Marker longitude={ride.car_lng} latitude={ride.car_lat} anchor="center">
                                    <span className="material-icons text-white text-4xl drop-shadow-lg">local_taxi</span>
                                </Marker>
                            )}
                        </Map>
                    )}
                </div>
            )}

            {/* ── Bottom panel ── */}
            <div className="absolute bottom-0 inset-x-0 z-10 bg-gray-900/95 backdrop-blur border-t border-gray-800 rounded-t-3xl p-6 pb-8">

                {/* Sender waiting */}
                {showWaiting && (
                    <div className="text-center">
                        {ride.status === 'requested' ? (
                            <>
                                <div className="w-10 h-10 border-4 border-gray-700 border-t-blue-400 rounded-full animate-spin mx-auto mb-3" />
                                <h3 className="font-bold text-lg mb-1">Waiting for your match</h3>
                                <p className="text-gray-400 text-sm">They're entering their pickup address privately…</p>
                                <div className="mt-4 bg-gray-800 rounded-2xl p-4 text-left">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Destination</p>
                                    <p className="text-white font-semibold">{ride.dest_name}</p>
                                    <p className="text-gray-400 text-sm">{ride.dest_address}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-center gap-2 mb-3">
                                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
                                    <h3 className="font-bold text-lg text-green-400">Pickup confirmed!</h3>
                                </div>
                                <p className="text-gray-400 text-sm">Your match is opening Uber now…</p>
                                <div className="mt-4 bg-gray-800 rounded-2xl p-4 text-left">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Destination</p>
                                    <p className="text-white font-semibold">{ride.dest_name}</p>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* En route */}
                {ride.status === 'en_route' && (
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
                            <div>
                                <h3 className="font-bold text-lg">Ride in progress</h3>
                                <p className="text-gray-400 text-sm">
                                    {isSender
                                        ? "Track your match's location on the map"
                                        : 'Your driver is on the way \u2014 check Uber app for details'}
                                </p>
                            </div>
                        </div>

                        <div className="bg-gray-800 rounded-2xl p-4 flex items-center gap-4 mb-3">
                            <span className="material-icons text-yellow-400 text-3xl">local_taxi</span>
                            <div className="flex-1">
                                <p className="font-bold">{ride.dest_name}</p>
                                <p className="text-sm text-gray-400">{ride.dest_address}</p>
                            </div>
                            {!isSender && (
                                <a
                                    href={`https://m.uber.com`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-black text-white text-xs font-bold px-3 py-2 rounded-xl border border-gray-600 hover:border-white transition-colors"
                                >
                                    Open Uber
                                </a>
                            )}
                        </div>

                        {!isSender && (
                            <button
                                onClick={() => safeRideService.markArrived(sessionId)}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                            >
                                <span className="material-icons">check_circle</span>
                                I've Arrived!
                            </button>
                        )}

                        {isSender && (
                            <p className="text-center text-xs text-gray-500 mt-1">
                                🔵 Blue dot = your match's live location
                            </p>
                        )}
                    </div>
                )}

                {/* Arrived */}
                {ride.status === 'arrived' && (
                    <div className="text-center py-2">
                        <div className="w-16 h-16 bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span className="material-icons text-green-400 text-3xl">done_all</span>
                        </div>
                        <h3 className="font-bold text-xl text-green-400 mb-1">Arrived!</h3>
                        <p className="text-gray-400 text-sm">Enjoy your date at <strong>{ride.dest_name}</strong> 🎉</p>
                        <button
                            onClick={() => navigate(-1)}
                            className="mt-5 bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3 rounded-full transition-colors"
                        >
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
