import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { useToast } from '../context/ToastContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Detect gender via Supabase Edge Function (server-side → no CORS issues)
async function analyzeSelfieFace(base64DataUrl) {
    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/yandex-vision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ image: base64DataUrl }),
        });
        if (!response.ok) return { ok: false, gender: null, faceCount: 0 };
        const data = await response.json();
        return { ok: true, gender: data.gender ?? null, faceCount: data.faceCount ?? 0 };
    } catch (e) {
        console.warn('Face analysis failed (non-fatal):', e);
        return { ok: false, gender: null, faceCount: 0 };
    }
}

export default function Verification() {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();

    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const [stream, setStream] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // 0=Intro, 1=Camera, 2=Captured, 3=Success
    const [step, setStep] = useState(0);

    // Stop camera on unmount
    useEffect(() => {
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [stream]);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            setStream(mediaStream);
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
            setStep(1);
        } catch {
            toast.error("No se pudo acceder a la cámara. Verifica los permisos.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            setStream(null);
        }
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(imageDataUrl);
        stopCamera();
        setStep(2);
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        startCamera();
    };

    const submitFace = async () => {
        if (!capturedImage || !user?.id) return;
        setIsProcessing(true);

        try {
            // Analyze selfie via Yandex Vision Edge Function
            const { ok, gender: detectedGender, faceCount } = await analyzeSelfieFace(capturedImage);

            if (ok && faceCount === 0) {
                toast.error("No detectamos un rostro. Asegúrate de que tu cara esté bien iluminada.");
                setIsProcessing(false);
                return;
            }

            // Gender check — only block if detected AND declared AND they clearly mismatch
            const declaredGender = user.gender?.toLowerCase();
            const genderMismatch = detectedGender && declaredGender &&
                declaredGender !== 'other' && detectedGender !== declaredGender;

            if (genderMismatch) {
                toast.error(`El género detectado (${detectedGender === 'male' ? 'Hombre' : 'Mujer'}) no coincide con el perfil (${declaredGender === 'male' ? 'Hombre' : 'Mujer'}).`);
                setIsProcessing(false);
                return;
            }

            await completeVerification(detectedGender || declaredGender || 'other');

        } catch (err) {
            console.error('submitFace error:', err);
            toast.error("Error al analizar. Intenta de nuevo.");
        } finally {
            setIsProcessing(false);
        }
    };

    const completeVerification = async (verifiedGender) => {
        try {
            const { error: verErr } = await supabase
                .from('users')
                .update({ is_verified: true, gender: verifiedGender || user?.gender })
                .eq('id', user?.id);
            if (verErr) throw verErr;

            // Re-sync local auth state from DB
            if (refreshUser) await refreshUser();

            setStep(3);
            toast.success("¡Identidad Confirmada!");

            setTimeout(() => {
                const g = verifiedGender || user.gender;
                if (g === 'female') navigate('/chat/women');
                else if (g === 'male') navigate('/chat/men');
                else navigate('/chat');
            }, 2000);

        } catch (e) {
            console.error('completeVerification error:', e);
            toast.error("Error confirmando estado. Intenta de nuevo.");
        }
    };

    // ── Step 3: Success ──
    if (step === 3) {
        return (
            <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-6">
                <div className="text-center">
                    <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <span className="material-icons text-5xl text-green-500">check_circle</span>
                    </div>
                    <h1 className="text-2xl font-bold mt-4 text-white">¡Verificado!</h1>
                    <p className="text-gray-400 mt-2">Identidad confirmada correctamente.</p>
                    <p className="text-xs text-gray-500 mt-1">Redirigiendo...</p>
                </div>
            </div>
        );
    }

    // ── Steps 0–2 ──
    return (
        <div className="min-h-screen bg-background-dark flex flex-col items-center justify-center p-6 text-gray-100">
            <div className="max-w-md w-full bg-[#1a202c] rounded-3xl p-8 text-center border border-gray-800 shadow-2xl">

                {/* Icon + Title */}
                <span className="material-icons text-4xl text-primary mb-3 block">face</span>
                <h1 className="text-2xl font-bold mb-1">Verificación Facial</h1>
                <p className="text-sm text-gray-400 mb-6">
                    {step === 0 && "Tomaremos una selfie para confirmar tu identidad."}
                    {step === 1 && "Mira a la cámara y presiona Capturar."}
                    {step === 2 && "¿La foto es clara? Envíala o repítela."}
                </p>

                {/* Camera / Preview area */}
                <div className="mb-6 relative rounded-2xl bg-black aspect-[3/4] overflow-hidden">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover scale-x-[-1] ${capturedImage ? 'hidden' : 'block'}`}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    {capturedImage && (
                        <img src={capturedImage} className="w-full h-full object-cover" alt="Selfie capturado" />
                    )}
                    {step === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-40 h-52 border-2 border-dashed border-white/30 rounded-[50%]" />
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="space-y-3">
                    {step === 0 && (
                        <button
                            onClick={startCamera}
                            className="w-full py-4 bg-primary rounded-xl font-bold text-white text-lg active:scale-95 transition-all shadow-lg shadow-primary/30"
                        >
                            Iniciar Escaneo
                        </button>
                    )}

                    {step === 1 && (
                        <button
                            onClick={capturePhoto}
                            className="w-full py-4 bg-white text-black rounded-xl font-bold text-lg active:scale-95 transition-all"
                        >
                            <span className="flex items-center justify-center gap-2">
                                <span className="material-icons">camera_alt</span>
                                Capturar Foto
                            </span>
                        </button>
                    )}

                    {step === 2 && (
                        <div className="flex gap-3">
                            <button
                                onClick={retakePhoto}
                                disabled={isProcessing}
                                className="flex-1 py-3 bg-gray-700 rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-50"
                            >
                                Repetir
                            </button>
                            <button
                                onClick={submitFace}
                                disabled={isProcessing}
                                className="flex-1 py-3 bg-primary rounded-xl font-bold text-white active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Analizando...
                                    </>
                                ) : 'Enviar'}
                            </button>
                        </div>
                    )}
                </div>

                <button
                    onClick={() => navigate(-1)}
                    className="mt-6 text-gray-500 text-xs hover:text-white transition"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}
