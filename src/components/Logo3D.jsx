import React, { useEffect, useRef } from 'react';

/**
 * Logo3D - RedFlag neon 3D logo con animaciones CSS puras
 * No requiere Three.js — usa CSS transforms 3D + keyframes neon
 */
export default function Logo3D({ size = 120, animate = true, className = '' }) {
    const containerRef = useRef(null);

    return (
        <div
            ref={containerRef}
            className={`relative flex items-center justify-center ${className}`}
            style={{ width: size, height: size }}
        >
            {/* Outer glow halo */}
            <div
                className="absolute rounded-full pointer-events-none"
                style={{
                    width: size * 1.6,
                    height: size * 1.6,
                    background: 'radial-gradient(circle, rgba(212,17,180,0.35) 0%, rgba(140,0,200,0.15) 50%, transparent 70%)',
                    filter: 'blur(18px)',
                    animation: animate ? 'logo3d-pulse 3s ease-in-out infinite' : 'none',
                }}
            />

            {/* 3D rotating container */}
            <div
                style={{
                    width: size,
                    height: size,
                    perspective: size * 4,
                    perspectiveOrigin: '50% 50%',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        transformStyle: 'preserve-3d',
                        animation: animate ? 'logo3d-float 6s ease-in-out infinite' : 'none',
                    }}
                >
                    {/* App icon base — rounded square con gradiente neon */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: size * 0.22,
                            background: 'linear-gradient(135deg, #3a0050 0%, #1a0030 40%, #2d0040 100%)',
                            boxShadow: `
                                0 0 ${size * 0.25}px rgba(212,17,180,0.8),
                                0 0 ${size * 0.5}px rgba(212,17,180,0.4),
                                0 0 ${size * 0.9}px rgba(140,0,200,0.2),
                                inset 0 0 ${size * 0.15}px rgba(212,17,180,0.15)
                            `,
                            border: '2px solid rgba(212,17,180,0.9)',
                            animation: animate ? 'logo3d-glow 2.5s ease-in-out infinite alternate' : 'none',
                        }}
                    />

                    {/* Inner gradient overlay */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: '12%',
                            borderRadius: size * 0.14,
                            background: 'linear-gradient(135deg, rgba(212,17,180,0.08) 0%, rgba(100,0,180,0.12) 100%)',
                            backdropFilter: 'blur(2px)',
                        }}
                    />

                    {/* Folder icon — outline neon */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '22%',
                            left: '18%',
                            width: '64%',
                            height: '55%',
                        }}
                    >
                        {/* Folder tab */}
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '42%',
                            height: '28%',
                            borderRadius: `${size * 0.04}px ${size * 0.04}px 0 0`,
                            border: `2px solid rgba(255,80,200,1)`,
                            borderBottom: 'none',
                            boxShadow: `0 0 ${size*0.06}px rgba(255,80,200,0.9), 0 0 ${size*0.12}px rgba(212,17,180,0.5)`,
                        }} />
                        {/* Folder body */}
                        <div style={{
                            position: 'absolute',
                            top: '22%',
                            left: 0,
                            width: '100%',
                            height: '78%',
                            borderRadius: `0 ${size*0.04}px ${size*0.04}px ${size*0.04}px`,
                            border: `2px solid rgba(255,80,200,1)`,
                            boxShadow: `0 0 ${size*0.06}px rgba(255,80,200,0.9), 0 0 ${size*0.12}px rgba(212,17,180,0.5)`,
                        }} />
                        {/* Inner line */}
                        <div style={{
                            position: 'absolute',
                            top: '55%',
                            left: '10%',
                            width: '80%',
                            height: '2px',
                            background: 'rgba(255,80,200,0.6)',
                            boxShadow: `0 0 ${size*0.04}px rgba(255,80,200,0.8)`,
                        }} />
                    </div>

                    {/* Shield badge — top right corner */}
                    <div
                        style={{
                            position: 'absolute',
                            top: '-8%',
                            right: '-8%',
                            width: '34%',
                            height: '34%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <svg viewBox="0 0 40 44" fill="none" style={{ width: '100%', height: '100%', filter: `drop-shadow(0 0 ${size*0.05}px rgba(212,17,180,1)) drop-shadow(0 0 ${size*0.1}px rgba(140,0,200,0.8))` }}>
                            <path d="M20 2L36 9V22C36 33 20 40 20 40C20 40 4 33 4 22V9L20 2Z"
                                fill="rgba(60,0,80,0.9)"
                                stroke="rgba(212,17,180,1)"
                                strokeWidth="2"
                            />
                            <path d="M20 8L30 13V21C30 28 20 33 20 33C20 33 10 28 10 21V13L20 8Z"
                                fill="rgba(212,17,180,0.15)"
                                stroke="rgba(255,100,220,0.8)"
                                strokeWidth="1.5"
                            />
                        </svg>
                    </div>

                    {/* Corner circuit dots */}
                    {[
                        { top: '8%', left: '8%' },
                        { top: '8%', right: '8%' },
                        { bottom: '8%', left: '8%' },
                        { bottom: '8%', right: '8%' },
                    ].map((pos, i) => (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                ...pos,
                                width: size * 0.06,
                                height: size * 0.06,
                                borderRadius: '50%',
                                background: 'rgba(212,17,180,0.9)',
                                boxShadow: `0 0 ${size*0.06}px rgba(212,17,180,1), 0 0 ${size*0.12}px rgba(140,0,200,0.8)`,
                                animation: animate ? `logo3d-dot-pulse ${1.5 + i * 0.3}s ease-in-out infinite alternate` : 'none',
                            }}
                        />
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes logo3d-float {
                    0%   { transform: rotateX(0deg) rotateY(0deg) translateY(0px); }
                    25%  { transform: rotateX(8deg) rotateY(12deg) translateY(-4px); }
                    50%  { transform: rotateX(0deg) rotateY(20deg) translateY(-2px); }
                    75%  { transform: rotateX(-6deg) rotateY(8deg) translateY(-5px); }
                    100% { transform: rotateX(0deg) rotateY(0deg) translateY(0px); }
                }
                @keyframes logo3d-glow {
                    from {
                        box-shadow:
                            0 0 ${size * 0.2}px rgba(212,17,180,0.7),
                            0 0 ${size * 0.4}px rgba(212,17,180,0.35),
                            0 0 ${size * 0.7}px rgba(140,0,200,0.2),
                            inset 0 0 ${size * 0.12}px rgba(212,17,180,0.12);
                        border-color: rgba(212,17,180,0.85);
                    }
                    to {
                        box-shadow:
                            0 0 ${size * 0.35}px rgba(255,50,220,1),
                            0 0 ${size * 0.6}px rgba(212,17,180,0.6),
                            0 0 ${size * 1.0}px rgba(140,0,200,0.35),
                            inset 0 0 ${size * 0.2}px rgba(212,17,180,0.25);
                        border-color: rgba(255,80,220,1);
                    }
                }
                @keyframes logo3d-pulse {
                    0%, 100% { opacity: 0.6; transform: scale(1); }
                    50% { opacity: 1; transform: scale(1.1); }
                }
                @keyframes logo3d-dot-pulse {
                    from { opacity: 0.4; transform: scale(0.8); }
                    to   { opacity: 1.0; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
}
