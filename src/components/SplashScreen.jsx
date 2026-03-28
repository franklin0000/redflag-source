import React, { useState, useEffect } from 'react';
import Logo3D from './Logo3D';

export default function SplashScreen({ onComplete }) {
    const [fading, setFading] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Entrada suave
        const show = setTimeout(() => setVisible(true), 80);
        const fade = setTimeout(() => {
            setFading(true);
            setTimeout(onComplete, 500);
        }, 2800);
        return () => { clearTimeout(show); clearTimeout(fade); };
    }, [onComplete]);

    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden"
            style={{
                background: 'radial-gradient(ellipse at 50% 40%, #1a0028 0%, #0d0018 50%, #080010 100%)',
                opacity: fading ? 0 : visible ? 1 : 0,
                transition: fading ? 'opacity 0.5s ease-out' : 'opacity 0.4s ease-in',
            }}
        >
            {/* Fondo de particulas decorativas */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(12)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                            width: Math.random() * 4 + 2,
                            height: Math.random() * 4 + 2,
                            left: `${10 + i * 7.5}%`,
                            top: `${15 + (i % 4) * 20}%`,
                            background: i % 2 === 0 ? 'rgba(212,17,180,0.8)' : 'rgba(140,0,200,0.8)',
                            boxShadow: `0 0 8px ${i % 2 === 0 ? 'rgba(212,17,180,1)' : 'rgba(140,0,200,1)'}`,
                            animation: `splash-dot ${2 + (i % 3) * 0.7}s ease-in-out ${i * 0.2}s infinite alternate`,
                        }}
                    />
                ))}
            </div>

            {/* Halos de fondo */}
            <div className="absolute pointer-events-none" style={{
                width: 400, height: 400,
                background: 'radial-gradient(circle, rgba(212,17,180,0.18) 0%, transparent 70%)',
                filter: 'blur(40px)',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -60%)',
                animation: 'splash-halo 3s ease-in-out infinite alternate',
            }} />

            {/* Logo 3D */}
            <div style={{
                transform: visible ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.85)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.7s cubic-bezier(0.34,1.56,0.64,1), opacity 0.5s ease',
            }}>
                <Logo3D size={140} animate={true} />
            </div>

            {/* Texto */}
            <div style={{
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                opacity: visible ? 1 : 0,
                transition: 'transform 0.7s ease 0.2s, opacity 0.5s ease 0.2s',
                textAlign: 'center',
                marginTop: 20,
            }}>
                <h1 style={{
                    fontSize: 32,
                    fontWeight: 800,
                    letterSpacing: '-0.5px',
                    background: 'linear-gradient(90deg, #ff40c8 0%, #d411b4 50%, #9000d0 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    textShadow: 'none',
                    marginBottom: 6,
                }}>
                    RedFlag<span style={{ WebkitTextFillColor: 'rgba(255,255,255,0.5)', fontSize: 24 }}>.io</span>
                </h1>
                <p style={{ color: 'rgba(180,100,200,0.8)', fontSize: 13, letterSpacing: '0.05em' }}>
                    Protecting your relationships
                </p>
            </div>

            {/* Barra de progreso neon */}
            <div style={{
                width: 180,
                height: 3,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 99,
                marginTop: 36,
                overflow: 'hidden',
                opacity: visible ? 1 : 0,
                transition: 'opacity 0.4s ease 0.4s',
            }}>
                <div style={{
                    height: '100%',
                    borderRadius: 99,
                    background: 'linear-gradient(90deg, #d411b4, #9000d0)',
                    boxShadow: '0 0 10px rgba(212,17,180,0.8)',
                    animation: 'splash-progress 2.8s ease-in-out forwards',
                }} />
            </div>

            <style>{`
                @keyframes splash-progress {
                    from { width: 0%; }
                    to   { width: 100%; }
                }
                @keyframes splash-dot {
                    from { opacity: 0.2; transform: scale(0.8) translateY(0); }
                    to   { opacity: 1.0; transform: scale(1.4) translateY(-6px); }
                }
                @keyframes splash-halo {
                    from { transform: translate(-50%, -60%) scale(0.9); opacity: 0.7; }
                    to   { transform: translate(-50%, -58%) scale(1.1); opacity: 1.0; }
                }
            `}</style>
        </div>
    );
}
