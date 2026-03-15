
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { selectedScanFile, setSelectedScanFile, setScanDetails } from '../services/scanState';

export default function FacialScan() {
    const navigate = useNavigate();
    const location = useLocation();
    const [file, setFile] = useState(location.state?.file || selectedScanFile);

    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Initializing handshake...');
    const [isError, setIsError] = useState(false);
    const [errorDetail, setErrorDetail] = useState('');
    const [consentGranted, setConsentGranted] = useState(false);

    const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);

    // Clean up the object URL when component unmounts
    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    useEffect(() => {
        if (!file) {
            // Redirect if no file provided is handled by return null render or parent
            return;
        }

        let isMounted = true;

        async function startScan() {
            if (!isMounted) return;

            setStatus('Securely hashing image...');
            setProgress(10);
            await new Promise(r => setTimeout(r, 600));

            try {
                // Convert file to Base64 for APIs + result preview
                const base64String = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                // ── STEP 1: Face Detection (face-api.js, 100% local) ──
                if (!isMounted) return;
                setStatus('Loading neural networks...');
                setProgress(20);

                const { detectFace } = await import('../services/faceService');
                const faceResult = await detectFace(file);

                if (!faceResult.detected) {
                    throw new Error('No face detected in this photo. Please use a clear front-facing photo.');
                }

                if (!isMounted) return;
                setStatus('Face locked — launching dual-engine search...');
                setProgress(40);
                await new Promise(r => setTimeout(r, 400));

                // ── STEP 2: Local RedFlag Scanner Engine ──
                if (!isMounted) return;
                setStatus('Deploying RedFlag detection neural nets...');
                setProgress(50);

                const { runLocalScan } = await import('../services/scannerService');
                const scanRes = await runLocalScan(file);

                if (scanRes.error) {
                    throw new Error(scanRes.error || 'Local scan failed.');
                }

                if (!isMounted) return;
                setProgress(95);
                setStatus('Finalizing forensic report...');

                // ── STEP 3: Merge results ──
                const results = scanRes.results || [];

                // Check for automatic web search redirect
                const autoOpen = results.find(r => r.openNow && r.url);
                if (autoOpen) {
                    window.open(autoOpen.url, '_blank');
                }

                await new Promise(r => setTimeout(r, 600));
                if (!isMounted) return;
                setProgress(100);
                setStatus('Encryption complete. Report ready.');
                await new Promise(r => setTimeout(r, 400));

                setScanDetails(results, base64String);
                navigate('/results');

            } catch (error) {
                console.error("Scan Error:", error);
                if (isMounted) {
                    setStatus('Scan failed.');
                    setErrorDetail(error.message || 'Unknown error');
                    setIsError(true);
                }
            }
        }

        startScan();

        return () => {
            isMounted = false;
        };
    }, [file, navigate, previewUrl]);

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            const newFile = e.target.files[0];
            setSelectedScanFile(newFile);
            setFile(newFile);
        }
    }

    if (!file) {
        return (
            <div className="bg-background-light dark:bg-background-dark font-display text-slate-800 dark:text-white min-h-screen flex flex-col items-center justify-center p-6">
                <header className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
                    <div className="flex items-center gap-2">
                        <span className="material-icons text-primary text-sm">radar</span>
                        <span className="text-xs font-bold tracking-widest text-primary/80 uppercase">RedFlag Scan Engine v1.0</span>
                    </div>
                    <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-icons">close</span>
                    </button>
                </header>

                <div className="text-center max-w-md w-full space-y-8 animate-fade-in-up">
                    <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
                        <div className="relative z-10 w-full h-full bg-gradient-to-tr from-primary to-emerald-600 rounded-full flex items-center justify-center shadow-xl shadow-primary/30">
                            <span className="material-icons text-5xl text-white">center_focus_weak</span>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-600 dark:from-white dark:to-slate-300 mb-2">
                            Initialize Scan
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400">
                            Upload a photo to begin the biometric analysis against our databases.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800/50">
                            <input
                                type="checkbox"
                                id="consent"
                                checked={consentGranted}
                                onChange={(e) => setConsentGranted(e.target.checked)}
                                className="mt-1 w-4 h-4 text-primary bg-white border-red-300 rounded focus:ring-primary dark:focus:ring-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
                            />
                            <label htmlFor="consent" className="text-xs text-red-700 dark:text-red-400 cursor-pointer select-none">
                                <strong>Ethics & Privacy Disclaimer:</strong> I confirm I have obtained necessary consent or am acting within my legal rights to search this individual. I will not use this information for harassment, stalking, or illegal purposes.
                            </label>
                        </div>

                        <label className={`block w-full transition-all ${consentGranted ? 'cursor-pointer group' : 'cursor-not-allowed opacity-50 grayscale'}`}>
                            <div className={`relative overflow-hidden rounded-2xl border-2 border-dashed ${consentGranted ? 'border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10' : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'} p-8 transition-all`}>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    disabled={!consentGranted}
                                    onChange={handleFileSelect}
                                />
                                <div className="flex flex-col items-center gap-3">
                                    <span className={`material-icons text-4xl ${consentGranted ? 'text-primary' : 'text-slate-400'} transition-colors`}>add_a_photo</span>
                                    <span className={`font-semibold ${consentGranted ? 'text-primary' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {consentGranted ? 'Select Photo' : 'Accept Terms to Upload'}
                                    </span>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="bg-background-light dark:bg-background-dark font-display text-slate-800 dark:text-white min-h-screen flex flex-col relative overflow-hidden selection:bg-primary selection:text-background-dark">
            {/* Ambient Background Effects */}
            <div className="absolute inset-0 opacity-30 pointer-events-none z-0 bg-[linear-gradient(to_right,rgba(13,242,128,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(13,242,128,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-background-dark to-transparent z-0 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-background-dark to-transparent z-0 pointer-events-none"></div>

            {/* Header */}
            <header className="relative z-10 px-6 py-6 flex justify-between items-center w-full max-w-md mx-auto">
                <div className="flex items-center gap-2">
                    <span className="material-icons text-primary animate-pulse text-sm">radar</span>
                    <span className="text-xs font-bold tracking-widest text-primary/80 uppercase">RedFlag Scan Engine v1.0</span>
                </div>
                <button onClick={() => navigate(-1)} className="text-xs font-medium text-slate-400 hover:text-white transition-colors uppercase tracking-wide border border-slate-700 rounded px-3 py-1 hover:border-primary hover:text-primary">
                    Abort
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col items-center justify-center w-full max-w-md mx-auto px-6 relative z-10 pb-12">
                {/* Scanner Visualization Container */}
                <div className="relative w-full aspect-[4/5] max-w-sm mx-auto mb-8 group">
                    {/* Corner HUD Elements */}
                    <div className="absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 border-primary rounded-tl-lg z-20"></div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 border-primary rounded-tr-lg z-20"></div>
                    <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 border-primary rounded-bl-lg z-20"></div>
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 border-primary rounded-br-lg z-20"></div>

                    {/* Image Container */}
                    <div className="relative w-full h-full rounded-lg overflow-hidden border border-primary/20 bg-background-dark shadow-2xl shadow-primary/10">
                        {previewUrl ? (
                            <img alt="Scanning" className="w-full h-full object-cover opacity-60 grayscale contrast-125 mix-blend-luminosity" src={previewUrl} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-700">No Image</div>
                        )}
                        <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4 border border-dashed border-primary/40 rounded-lg flex items-center justify-center">
                            <div className="w-2 h-2 bg-primary/50 rounded-full animate-ping"></div>
                        </div>
                        {/* Scan Line */}
                        <div className="absolute w-full h-1 bg-primary shadow-[0_0_15px_#0df280] animate-scan z-30 opacity-80 top-0"></div>
                    </div>
                </div>

                {/* Progress Section */}
                <div className="w-full max-w-sm space-y-4">
                    <div className="bg-black/40 border border-slate-800 rounded-lg p-4 font-mono text-sm relative overflow-hidden backdrop-blur-sm">
                        <div className="space-y-2 relative z-10">
                            <div className={`flex items-center gap-2 ${isError ? 'text-red-500' : 'text-primary'}`}>
                                <span className={`material-icons text-sm ${!isError && 'animate-spin'}`}>
                                    {isError ? 'error_outline' : 'sync'}
                                </span>
                                <span className="font-semibold">{status}</span>
                            </div>
                            {isError && (
                                <div className="space-y-2 mt-1">
                                    {errorDetail && (
                                        <p className="text-red-400/80 text-xs break-words">{errorDetail}</p>
                                    )}
                                    <button
                                        onClick={() => window.location.reload()}
                                        className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 rounded px-3 py-1 text-xs uppercase tracking-wide transition-colors"
                                    >
                                        Retry Scan
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-slate-400 uppercase tracking-wider">
                            <span>Scan Progress</span>
                            <span className="text-primary">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                            <div className="h-full bg-primary shadow-[0_0_10px_rgba(13,242,128,0.5)] transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                </div>
            </main>
            <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
      `}</style>
        </div>
    );
}
