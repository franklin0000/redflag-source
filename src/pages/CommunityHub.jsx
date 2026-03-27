import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdComponent from '../components/AdComponent';
import { getCommunityStats } from '../services/dashboardService';

const ROOMS = [
    {
        id: 'women',
        name: "Women's Room",
        subtitle: 'Safe space • Verified women only',
        icon: 'female',
        gradient: 'from-pink-500 to-rose-600',
        bg: 'bg-pink-500/10',
        borderColor: 'border-pink-500/20',
        glow: 'shadow-pink-500/20',
        members: 1247,
        postsToday: 38,
        gender: 'female',
        description: 'Share experiences, warn about red flags, and support each other. 100% private.',
        latestPost: '"Watch out for this guy on Tinder, sending the same copy-paste message..."',
    },
    {
        id: 'men',
        name: "Men's Room",
        subtitle: 'Brotherhood • Verified men only',
        icon: 'male',
        gradient: 'from-blue-500 to-indigo-600',
        bg: 'bg-blue-500/10',
        borderColor: 'border-blue-500/20',
        glow: 'shadow-blue-500/20',
        members: 983,
        postsToday: 24,
        gender: 'male',
        description: 'Real talk, real advice. Stay safe and look out for each other.',
        latestPost: '"Bro, run a background check first. Saved me from a crazy situation..."',
    },
    {
        id: 'general',
        name: 'Community Hub',
        subtitle: 'Open to all • Together we\'re stronger',
        icon: 'groups',
        gradient: 'from-purple-500 to-primary',
        bg: 'bg-purple-500/10',
        borderColor: 'border-purple-500/20',
        glow: 'shadow-purple-500/20',
        members: 3412,
        postsToday: 67,
        gender: null,
        description: 'United community for safety tips, alerts, and support. Everyone welcome.',
        latestPost: '"PSA: New scam going around on dating apps. They pretend to verify you..."',
    },
];

export default function CommunityHub() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [liveStats, setLiveStats] = useState({ totalUsers: 0 });

    useEffect(() => {
        getCommunityStats().then(setLiveStats).catch(() => {});
    }, []);

    // Distribute total users proportionally across rooms
    const getRoomMembers = (roomId) => {
        const total = liveStats.totalUsers || 0;
        if (roomId === 'women') return Math.max(ROOMS[0].members, Math.floor(total * 0.44));
        if (roomId === 'men') return Math.max(ROOMS[1].members, Math.floor(total * 0.27));
        return Math.max(ROOMS[2].members, total);
    };

    const canAccess = (room) => {
        if (!room.gender) return true; // Mixed room is open to all
        // Debugging access
        // console.log(`Checking access for room ${room.id}. User gender: ${user?.gender}, Room gender: ${room.gender}`);

        if (!user?.gender) return true; // Allow access to prompt for gender
        return user.gender.toLowerCase() === room.gender.toLowerCase();
    };

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100">
            {/* Header */}
            <header className="px-5 pt-8 pb-2">
                <h1 className="text-2xl font-bold tracking-tight">Community</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Private rooms. Real conversations. Stay safe.</p>
            </header>

            {/* Safety Banner */}
            <div className="mx-5 mt-3 mb-5 bg-primary/10 border border-primary/20 rounded-2xl p-4 flex items-start gap-3">
                <span className="material-icons text-primary mt-0.5">verified_user</span>
                <div>
                    <p className="text-xs text-primary leading-relaxed font-medium">All rooms are moderated and anonymous. No real names or photos are shared. Report any rule violations.</p>
                </div>
            </div>

            {/* Rooms List */}
            <main className="px-5 space-y-4 pb-28 animate-page-in">
                {ROOMS.map((room) => {
                    const accessible = canAccess(room);
                    return (
                        <div
                            key={room.id}
                            onClick={() => navigate(`/community/${room.id}`)}
                            className={`relative group overflow-hidden rounded-3xl border transition-all duration-300 bg-white dark:bg-[#1a1525] ${room.borderColor} hover:border-opacity-60 shadow-xl ${room.glow} hover:-translate-y-1 cursor-pointer active:scale-[0.98]`}
                        >
                            <div className="p-5 relative z-10">
                                <div className="flex items-center gap-4 mb-3">
                                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${room.gradient} flex items-center justify-center text-white shadow-lg`}>
                                        <span className="material-icons text-2xl">{room.icon}</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold">{room.name}</h3>
                                            {room.gender && !accessible && <span className="material-icons text-gray-400 text-base">lock</span>}
                                        </div>
                                        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{room.subtitle}</p>
                                    </div>
                                    <span className="material-icons text-gray-400 group-hover:text-primary transition-colors">chevron_right</span>
                                </div>

                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{room.description}</p>

                                {/* Latest Post Preview */}
                                <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 mb-3 border border-gray-100 dark:border-white/5">
                                    <p className="text-xs text-gray-600 dark:text-gray-300 italic line-clamp-2">{room.latestPost}</p>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <span className="material-icons text-sm">people</span>
                                        <span className="font-medium">{getRoomMembers(room.id).toLocaleString()}</span>
                                        <span>members</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <span className="material-icons text-sm">edit_note</span>
                                        <span className="font-medium">{room.postsToday}</span>
                                        <span>posts today</span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-1 text-xs text-green-500">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        Active now
                                    </div>
                                </div>
                            </div>

                            {/* Decorative glow */}
                            <div className={`absolute -right-6 -bottom-6 w-28 h-28 bg-gradient-to-br ${room.gradient} rounded-full blur-3xl opacity-10 group-hover:opacity-25 transition-opacity`} />
                        </div>
                    );
                })}

                {/* Whitepaper card */}
                <div
                    onClick={() => navigate('/whitepaper')}
                    className="relative group overflow-hidden rounded-3xl border border-[#d411b4]/20 bg-white dark:bg-[#1a1525] shadow-xl shadow-[#d411b4]/10 hover:-translate-y-1 hover:border-[#d411b4]/50 transition-all duration-300 cursor-pointer active:scale-[0.98]"
                >
                    <div className="p-5 relative z-10">
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#d411b4] to-purple-700 flex items-center justify-center text-white shadow-lg">
                                <span className="material-icons text-2xl">article</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold">$RFLAG White Paper</h3>
                                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Token · Tokenomics · Roadmap</p>
                            </div>
                            <span className="material-icons text-gray-400 group-hover:text-primary transition-colors">chevron_right</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">
                            Learn about the $RFLAG token, security proofs, anti-rug measures, and the full roadmap for the RedFlag ecosystem.
                        </p>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="material-icons text-sm">verified</span>
                                <span>Ownership Renounced</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                <span className="material-icons text-sm">lock</span>
                                <span>LP Locked 2yr</span>
                            </div>
                            <div className="ml-auto flex items-center gap-1 text-xs text-[#d411b4]">
                                <span className="font-bold">600B</span>
                                <span className="text-gray-400">supply</span>
                            </div>
                        </div>
                    </div>
                    <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-gradient-to-br from-[#d411b4] to-purple-700 rounded-full blur-3xl opacity-10 group-hover:opacity-25 transition-opacity" />
                </div>

                {/* Sponsored Ad */}
                <div className="pt-2">
                    <AdComponent slot="5748392810" format="fluid" layoutKey="-fb+5w+4e-db+86" />
                </div>
            </main>
        </div>
    );
}
