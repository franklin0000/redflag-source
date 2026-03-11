
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserDashboardStats, getCommunityStats, subscribeToLiveActivity } from '../services/dashboardService';
import { setSelectedScanFile } from '../services/scanState';

// Animated counter hook using IntersectionObserver
function useCountUp(target, duration = 1500) {
    const [count, setCount] = useState(0);
    const [started, setStarted] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
            { threshold: 0.3 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [started]);

    useEffect(() => {
        if (!started) return;
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
            start += step;
            if (start >= target) { setCount(target); clearInterval(timer); }
            else setCount(Math.floor(start));
        }, 16);
        return () => clearInterval(timer);
    }, [started, target, duration]);

    return { count, ref };
}

export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchType, setSearchType] = React.useState('name');
    const [query, setQuery] = React.useState('');

    // Real dashboard data
    const [stats, setStats] = useState({ totalScans: 0, reportsCount: 0, daysProtected: 1, safetyScore: 50 });
    const [community, setCommunity] = useState({ totalReports: 0, totalUsers: 0 });
    const [liveActivity, setLiveActivity] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);

    // Fetch real user & community stats
    useEffect(() => {
        let unsubActivity = null;

        const loadDashboard = async () => {
            setStatsLoading(true);
            try {
                const [userStats, communityStats] = await Promise.all([
                    getUserDashboardStats(user?.id),
                    getCommunityStats(),
                ]);
                setStats(userStats);
                setCommunity(communityStats);
            } catch (err) {
                console.warn('Dashboard load failed:', err);
            } finally {
                setStatsLoading(false);
            }
        };

        loadDashboard();

        // Subscribe to live activity ticker
        unsubActivity = subscribeToLiveActivity((activities) => {
            setLiveActivity(activities);
        });

        return () => {
            if (unsubActivity) unsubActivity();
        };
    }, [user?.id]);

    // Recalculate safety score trend (simple weekly delta)
    const scoreChange = stats.safetyScore > 50 ? Math.min(stats.safetyScore - 50, 15) : 0;
    const scoreFraction = stats.safetyScore / 100;

    const handleSearch = () => {
        if (!query.trim()) return;
        // Log the search to Firestore
        logSearch(user?.id, query, searchType);
        navigate('/results', { state: { query, searchType } });
    };

    const getPlaceholder = () => {
        switch (searchType) {
            case 'phone': return 'Enter phone number (e.g. 555-0123)...';
            case 'handle': return 'Enter username (e.g. @johndoe)...';
            default: return 'Start typing a full name...';
        }
    };

    // Generate ticker items from live activity or fallback
    const tickerItems = liveActivity.length > 0
        ? liveActivity.map(a => ({
            text: a.severity === 'high'
                ? `⚠️ ${a.name} flagged${a.location ? ` in ${a.location}` : ''}`
                : `📋 Report filed for ${a.name}`,
            live: a.severity === 'high',
        }))
        : [
            { text: 'Waiting for community activity...', live: false },
        ];

    return (
        <>
            {/* Hero / Upload Section */}
            <section className="px-5 pt-8 pb-6 relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[80px] -z-10 pointer-events-none"></div>
                <div className="mb-6 text-center">
                    <h2 className="text-3xl font-bold mb-2 leading-tight">Who are they <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">really?</span></h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Drop a photo to uncover their digital footprint across dating apps and the deep web.</p>
                </div>

                {/* Upload Card */}
                <label className="relative group cursor-pointer block">
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                                setSelectedScanFile(e.target.files[0]);
                                navigate('/scan');
                            }
                        }}
                    />
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                    <div className="relative bg-white dark:bg-[#2a1626] rounded-xl p-8 flex flex-col items-center justify-center border border-gray-100 dark:border-white/5 shadow-xl">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                            <span className="material-icons text-primary text-3xl">add_a_photo</span>
                        </div>
                        <h3 className="font-semibold text-lg mb-1">Upload Photo</h3>
                        <p className="text-xs text-gray-400 mb-4">Tap to select from library</p>
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 bg-gray-100 dark:bg-black/20 px-3 py-1.5 rounded-full">
                            <span className="material-icons text-xs">lock</span>
                            <span>100% Anonymous & Secure</span>
                        </div>
                    </div>
                </label>
            </section>

            {/* Divider */}
            <div className="flex items-center justify-center gap-4 px-10 mb-6 opacity-60">
                <div className="h-[1px] bg-gray-300 dark:bg-white/10 flex-1"></div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">OR SEARCH BY</span>
                <div className="h-[1px] bg-gray-300 dark:bg-white/10 flex-1"></div>
            </div>

            {/* Text Search Section */}
            <section className="px-5 mb-8">
                <div className="bg-white dark:bg-[#2a1626] p-1 rounded-xl shadow-lg border border-gray-200 dark:border-white/5 flex flex-col">
                    {/* Tabs */}
                    <div className="flex p-1 bg-gray-100 dark:bg-black/20 rounded-lg mb-3">
                        <button
                            onClick={() => setSearchType('name')}
                            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${searchType === 'name' ? 'bg-white dark:bg-primary shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Name
                        </button>
                        <button
                            onClick={() => setSearchType('phone')}
                            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${searchType === 'phone' ? 'bg-white dark:bg-primary shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            Phone
                        </button>
                        <button
                            onClick={() => setSearchType('handle')}
                            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all ${searchType === 'handle' ? 'bg-white dark:bg-primary shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                        >
                            @Handle
                        </button>
                    </div>
                    {/* Input */}
                    <div className="px-3 pb-3">
                        <div className="relative">
                            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-background-dark/50 border border-gray-200 dark:border-white/10 rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder-gray-400 dark:text-white"
                                placeholder={getPlaceholder()}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                        </div>
                        <button onClick={handleSearch} className="w-full mt-3 bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-lg shadow-lg shadow-primary/30 transition-all flex items-center justify-center gap-2">
                            <span>Search Database</span>
                            <span className="material-icons text-sm">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* Live Ticker */}
            <section className="mb-8 overflow-hidden bg-primary/5 border-y border-primary/10 py-2">
                <div className="flex whitespace-nowrap gap-8 animate-marquee">
                    {tickerItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs font-medium">
                            <span className={`w-2 h-2 rounded-full ${item.live ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                            <span className={item.live ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}>{item.text}</span>
                        </div>
                    ))}
                    {/* Duplicate for seamless loop */}
                    {tickerItems.map((item, i) => (
                        <div key={`dup-${i}`} className="flex items-center gap-2 text-xs font-medium">
                            <span className={`w-2 h-2 rounded-full ${item.live ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                            <span className={item.live ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}>{item.text}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Quick Actions (Requested Feature) */}
            <section className="px-5 mb-8 grid grid-cols-2 gap-3">
                <button
                    onClick={() => navigate('/dating')}
                    className="p-4 bg-gradient-to-br from-pink-500/10 to-rose-500/10 border border-pink-500/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-pink-500/20 transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-icons text-pink-500">favorite</span>
                    </div>
                    <span className="text-xs font-bold text-pink-600 dark:text-pink-400">Dating App</span>
                </button>

                <button
                    onClick={() => navigate('/report/new')}
                    className="p-4 bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-orange-500/20 transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-icons text-orange-500">campaign</span>
                    </div>
                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">File Report</span>
                </button>

                <button
                    onClick={() => navigate('/scan')}
                    className="p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-emerald-500/20 transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-icons text-emerald-500">qr_code_scanner</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Start Scan</span>
                </button>

                <button
                    onClick={() => navigate('/community/mixed')}
                    className="p-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-blue-500/20 transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="material-icons text-blue-500">forum</span>
                    </div>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Community</span>
                </button>
            </section>

            {/* Stats Dashboard */}
            <section className="px-5 mb-8">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 px-1">Your Dashboard</h3>

                {/* Safety Score Ring */}
                <div className="bg-white dark:bg-[#2a1626] rounded-2xl p-5 mb-4 border border-gray-100 dark:border-white/5 shadow-sm relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br from-primary/20 to-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex items-center gap-5 relative z-10">
                        {/* SVG Circle */}
                        <div className="relative w-20 h-20 flex-shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                                <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-gray-200 dark:text-white/10" />
                                <circle
                                    cx="40" cy="40" r="34" fill="none" strokeWidth="6" strokeLinecap="round"
                                    stroke="url(#scoreGrad)"
                                    strokeDasharray={`${213.6 * scoreFraction} ${213.6 * (1 - scoreFraction)}`}
                                    className="transition-all duration-1000 ease-out"
                                    style={{ animation: 'score-ring 1.5s ease-out forwards' }}
                                />
                                <defs>
                                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#d411b4" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-xl font-black text-gray-900 dark:text-white">
                                    {statsLoading ? '—' : stats.safetyScore}
                                </span>
                                <span className="text-[9px] text-gray-400 font-medium">/ 100</span>
                            </div>
                        </div>
                        <div className="flex-1">
                            <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1">Your Safety Score</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Based on your scan history, reports, and verification status.</p>
                            {scoreChange > 0 && (
                                <div className="flex items-center gap-1 mt-2">
                                    <span className="material-icons text-green-500 text-sm">trending_up</span>
                                    <span className="text-xs font-semibold text-green-500">+{scoreChange} this week</span>
                                </div>
                            )}
                            {scoreChange === 0 && !statsLoading && (
                                <div className="flex items-center gap-1 mt-2">
                                    <span className="material-icons text-gray-400 text-sm">info_outline</span>
                                    <span className="text-xs text-gray-400">Search & report to increase your score</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Counter Cards Grid — real data */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard icon="search" iconBg="bg-blue-500/10" iconColor="text-blue-500" label="Your Scans" target={stats.totalScans} />
                    <StatCard icon="flag" iconBg="bg-red-500/10" iconColor="text-red-500" label="Reports Filed" target={community.totalReports} />
                    <StatCard icon="verified_user" iconBg="bg-green-500/10" iconColor="text-green-500" label="Days Protected" target={stats.daysProtected} />
                    <StatCard icon="groups" iconBg="bg-purple-500/10" iconColor="text-purple-500" label="Community" target={community.totalUsers} suffix="+" />
                </div>
            </section>

            {/* Feature Grid (What We Check) */}
            <section className="px-5 mb-8">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 px-1">Coverage Scope</h3>
                <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center p-4 bg-white dark:bg-[#2a1626] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center mr-4">
                            <span className="material-icons text-rose-500">favorite_border</span>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm">Dating Apps</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Tinder, Bumble, Hinge & 50+ others</p>
                        </div>
                    </div>
                    <div className="flex items-center p-4 bg-white dark:bg-[#2a1626] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mr-4">
                            <span className="material-icons text-orange-500">warning_amber</span>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm">Risk Databases</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Escort directories & adult forums</p>
                        </div>
                    </div>
                    <div className="flex items-center p-4 bg-white dark:bg-[#2a1626] rounded-xl border border-gray-100 dark:border-white/5 shadow-sm">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mr-4">
                            <span className="material-icons text-primary">groups</span>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm">Community Reports</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Red flags submitted by verified users</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Recent Visual Reports (Carousel) */}
            <section className="pl-5 mb-6">
                <div className="flex justify-between items-end pr-5 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Checks</h3>
                    <a className="text-xs text-primary hover:text-primary/80" href="#" onClick={(e) => { e.preventDefault(); navigate('/alerts'); }}>View all</a>
                </div>
                <div className="flex overflow-x-auto hide-scrollbar gap-4 pb-4 pr-5">
                    <RecentReportsList />
                </div>
            </section>
        </>
    );
}

// Log search to Supabase for stats tracking
async function logSearch(userId, searchQuery, searchType) {
    if (!userId) return;
    try {
        const { supabase } = await import('../services/supabase');
        await supabase.from('searches').insert({
            user_id: userId,
            query: searchType ? `[${searchType}] ${searchQuery}` : searchQuery,
        });
    } catch (err) {
        console.warn('Failed to log search:', err);
    }
}

function RecentReportsList() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const { reportsService } = await import('../services/reportsService');
                const data = await reportsService.getRecentReports(5);
                setReports(data);
            } catch (error) {
                console.error("Failed to fetch reports", error);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    if (loading) {
        return [1, 2, 3].map(i => (
            <div key={i} className="min-w-[140px] aspect-[3/4] rounded-xl bg-gray-200 dark:bg-white/5 animate-pulse" />
        ));
    }

    if (reports.length === 0) {
        return (
            <div className="text-xs text-gray-400 italic p-4">No recent reports found. Be the first to add one!</div>
        );
    }

    return reports.map(report => (
        <div
            key={report.id}
            onClick={() => navigate(`/report/${report.id}`)}
            className="min-w-[140px] relative rounded-xl overflow-hidden aspect-[3/4] group cursor-pointer"
        >
            <img
                alt={report.reported_name || report.name || 'Report'}
                className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity blur-[2px]"
                src={(report.evidence_urls || report.photos || []).length > 0 ? (report.evidence_urls || report.photos)[0] : 'https://via.placeholder.com/150'}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3 flex flex-col justify-end">
                <div className="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded w-max mb-1 border border-orange-500/30">
                    {report.severity === 'high' ? 'FLAGGED' : 'REVIEW'}
                </div>
                <p className="text-xs font-bold text-white truncate">{report.reported_name || report.name || 'Unknown'}</p>
                <p className="text-[10px] text-gray-300 truncate">{new Date(report.createdAt).toLocaleDateString()}</p>
            </div>
        </div>
    ));
}


function StatCard({ icon, iconBg, iconColor, label, target, suffix = '' }) {
    const { count, ref } = useCountUp(target);
    const display = target >= 1000 ? `${(count / 1000).toFixed(count >= target ? 1 : 1)}k` : count;
    return (
        <div ref={ref} className="bg-white dark:bg-[#2a1626] rounded-xl p-4 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow group">
            <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <span className={`material-icons text-lg ${iconColor}`}>{icon}</span>
            </div>
            <p className="text-2xl font-black text-gray-900 dark:text-white tabular-nums">{display}{suffix}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">{label}</p>
        </div>
    );
}
