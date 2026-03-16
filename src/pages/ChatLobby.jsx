import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ChatLobby() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();

    const rooms = [
        {
            id: 'women',
            name: "Women's Room",
            description: "Safe space for women to discuss red flags and share experiences anonymously.",
            icon: "female",
            color: "from-pink-500 to-primary",
            active: user?.gender?.toLowerCase() === 'female',
            gender: 'female'
        },
        {
            id: 'men',
            name: "Men's Room",
            description: "Brothers' lounge. Real talk, real advice, 100% anonymous.",
            icon: "male",
            color: "from-blue-600 to-blue-400",
            active: user?.gender?.toLowerCase() === 'male',
            gender: 'male'
        }
    ];

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100 flex flex-col antialiased">
            <header className="p-6 pt-12">
                <h1 className="text-3xl font-bold tracking-tight">Anonymous Chat</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-2">100% private. 100% anonymous.</p>
            </header>

            <main className="flex-1 px-6 space-y-6 pb-24 animate-page-in">
                <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
                    <span className="material-icons text-primary mt-1">shield</span>
                    <p className="text-xs text-primary leading-relaxed">
                        Each chat room is strictly for its verified gender. Messages automatically expire after 24 hours to protect your privacy.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {rooms.map((room) => (
                            <div
                                key={room.id}
                                className={`relative group overflow-hidden rounded-3xl border-2 transition-all duration-300 ${room.active
                                    ? 'bg-white dark:bg-[#1a1525] border-transparent hover:border-primary/30 shadow-xl hover:-translate-y-1 cursor-pointer'
                                    : 'bg-gray-100 dark:bg-white/5 border-transparent opacity-60 cursor-not-allowed grayscale'
                                    }`}
                                onClick={() => {
                                    if (!room.active) return;

                                    // GENDER GATE: user must have completed selfie verification
                                    if (!user?.gender_verified) {
                                        toast.warning('Debes verificar tu identidad primero. Ve a Community → sala privada para verificar.');
                                        navigate('/community/' + room.id);
                                        return;
                                    }

                                    navigate(`/chat/${room.id}`);
                                }
                                }
                            >
                                {/* Card Content */}
                                <div className="p-6 relative z-10">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${room.color} flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                            <span className="material-icons text-3xl">{room.icon}</span>
                                        </div>
                                        {room.active ? (
                                            <div className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                </span>
                                                <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">
                                                    Active
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="p-2 bg-gray-200 dark:bg-white/10 rounded-full">
                                                <span className="material-icons text-gray-400 text-sm">lock</span>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{room.name}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
                                            {room.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Background decoration */}
                                {room.active && (
                                    <div className={`absolute -right-8 -bottom-8 w-32 h-32 bg-gradient-to-br ${room.color} rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="text-center pt-4">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
                            Identity verification is active
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
