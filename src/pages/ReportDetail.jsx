import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { reportsApi } from '../services/api';
import { secureGet } from '../services/secureStorage';

const getTimeAgo = (timestamp) => {
    // Handle ISO string or timestamp number
    const date = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const seconds = Math.floor((Date.now() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
};

export default function ReportDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const inputRef = useRef(null);
    const commentsEndRef = useRef(null);

    // State for report data
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRevealed, setIsRevealed] = useState(false);

    // Fetch Report Data
    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            try {
                // 1. Check Offline Storage
                if (id.startsWith('local_')) {
                    const offlineReports = await secureGet('offline_reports');
                    const localReport = offlineReports?.find(r => r.id === id);
                    if (localReport) {
                        setReport({
                            ...localReport,
                            initials: (localReport.name || 'AN').substring(0, 2).toUpperCase(),
                            flags: [localReport.type], // Map type to flags array
                            riskLevel: localReport.severity,
                            reportCount: 1, // Offline reports start with 1
                            user: 'You (Offline)', // Indicate it's the user's report
                            location: 'Local Draft'
                        });
                        setLoading(false);
                        return;
                    }
                }

                // 2. Fetch from Express API
                const data = await reportsApi.getReport(id);

                if (data) {
                    setReport({
                        ...data,
                        initials: (data.reported_name || 'AN').substring(0, 2).toUpperCase(),
                        flags: [data.category].filter(Boolean),
                        riskLevel: 'medium',
                        reportCount: data.upvotes || 1,
                        user: data.reporter_name || 'Anonymous',
                        verified: data.reporter_verified,
                        location: '',
                        image: data.evidence_urls?.[0] || null,
                        timestamp: data.created_at,
                    });
                }
            } catch (error) {
                console.error("Error fetching report:", error);
                toast.error("Could not load report details.");
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [id, toast]);

    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [upvoted, setUpvoted] = useState({});

    // Subscribe to real-time comments for this report
    useEffect(() => {
        if (!id) return;

        // Supabase Realtime Subscription for comments table
        // We filter by report_id. Note: RLS must allow this.

        // Fetch from Express API
        const fetchComments = async () => {
            try {
                const data = await reportsApi.getComments(id);
                if (data) setComments(data.map(c => ({ ...c, user: { name: c.user_name } })));
            } catch (err) {
                console.warn('Failed to load comments:', err);
            }
        };
        fetchComments();
    }, [id]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300">Report Not Found</h2>
                    <button onClick={() => navigate('/reports')} className="mt-4 text-primary hover:underline">
                        Go back to reports
                    </button>
                </div>
            </div>
        );
    }

    const handleSubmitComment = async () => {
        if (!newComment.trim()) return;

        // Handle local offline reports
        if (id.startsWith('local_')) {
            setComments(prev => [...prev, {
                id: Date.now(),
                user: user?.name || 'Anonymous',
                initials: (user?.name || 'AN').substring(0, 2).toUpperCase(),
                content: newComment.trim(),
                created_at: new Date().toISOString(),
                upvotes: 0
            }]);
            setNewComment('');
            return;
        }

        try {
            const comment = await reportsApi.postComment(id, newComment.trim());
            setComments(prev => [...prev, { ...comment, user: { name: comment.user_name || user?.name } }]);
            setNewComment('');
            toast.success('Comment posted');
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (error) {
            console.error("Error posting comment:", error);
            toast.error("Failed to post comment");
        }
    };

    const handleUpvote = async (commentId) => {
        if (upvoted[commentId]) return;
        setUpvoted(prev => ({ ...prev, [commentId]: true }));

        try {
            const result = await reportsApi.upvoteComment(id, commentId);
            setComments(prev => prev.map(c =>
                c.id === commentId ? { ...c, upvotes: result.upvotes ?? (c.upvotes + 1) } : c
            ));
        } catch (error) {
            console.error("Error upvoting:", error);
            setUpvoted(prev => ({ ...prev, [commentId]: false }));
        }
    };

    // ... rest of component


    const handleShare = () => {
        if (navigator.share) {
            navigator.share({ title: `RedFlag Report: ${report.flags[0]}`, text: report.description });
        } else {
            navigator.clipboard.writeText(`RedFlag Report: ${report.flags.join(', ')} - ${report.description}`);
            toast.success('Report link copied');
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100 flex flex-col">
            {/* Header */}
            <header className="sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-lg border-b border-gray-200 dark:border-white/5 px-4 py-3 flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                    <span className="material-icons">chevron_left</span>
                </button>
                <h1 className="text-base font-bold">Report Details</h1>
                <button onClick={handleShare} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                    <span className="material-icons text-xl">share</span>
                </button>
            </header>

            {/* Main scrollable content */}
            <div className="flex-1 overflow-y-auto pb-20">
                {/* Report Card */}
                <div className="px-4 pt-4">
                    <div className="bg-white dark:bg-[#2d1b2a] rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 shadow-sm">
                        {/* Reporter Info */}
                        <div className="p-4 flex items-center gap-3 border-b border-gray-100 dark:border-white/5">
                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-purple-500 to-primary flex items-center justify-center text-white font-bold text-sm">
                                {report.initials}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{report.user}</span>
                                    {report.verified && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-500">✓ Verified</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                    <span>{getTimeAgo(report.timestamp)}</span>
                                    {report.location && (
                                        <span className="flex items-center gap-0.5">
                                            <span className="material-icons text-[10px]">location_on</span>
                                            {report.location}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${report.riskLevel === 'high' ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                    {report.riskLevel} risk
                                </span>
                            </div>
                        </div>


                        {/* Photo - Click to Reveal */}
                        <div
                            className="relative w-full bg-gray-900 overflow-hidden cursor-pointer group flex items-center justify-center"
                            onClick={() => setIsRevealed(!isRevealed)}
                        >
                            <img
                                src={report.image}
                                alt="Report"
                                className={`w-full max-h-[480px] object-contain transition-all duration-500 ${isRevealed ? 'opacity-100 blur-0 scale-100' : 'opacity-50 blur-xl scale-110'}`}
                            />

                            {!isRevealed && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 transition-opacity duration-300">
                                    <div className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 mb-2 group-hover:bg-black/50 transition-colors">
                                        <span className="material-icons text-white text-2xl">visibility_off</span>
                                    </div>
                                    <span className="text-xs font-medium text-white/80 uppercase tracking-widest">Tap to Reveal Identity</span>
                                </div>
                            )}

                            {isRevealed && (
                                <div className="absolute top-2 right-2 z-10">
                                    <div className="bg-black/50 backdrop-blur p-1.5 rounded-full text-white/80">
                                        <span className="material-icons text-sm">visibility</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            <div className="flex flex-wrap gap-2 mb-3">
                                {report.flags.map((flag, i) => (
                                    <span key={i} className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${i % 2 === 0 ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-orange-500/10 border-orange-500/20 text-orange-500'}`}>
                                        {flag}
                                    </span>
                                ))}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{report.description}</p>

                            {/* Stats Row */}
                            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-white/5">
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <span className="material-icons text-sm">flag</span>
                                    <span>{report.reportCount} reports</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                    <span className="material-icons text-sm">chat_bubble_outline</span>
                                    <span>{comments.length} comments</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Comments Section */}
                <div className="px-4 mt-6">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="material-icons text-lg text-primary">forum</span>
                        Community Discussion
                        <span className="text-xs font-medium text-gray-400">({comments.length})</span>
                    </h3>

                    {comments.length === 0 ? (
                        <div className="text-center py-10">
                            <span className="material-icons text-4xl text-gray-300 dark:text-gray-600 mb-2">chat</span>
                            <p className="text-sm text-gray-500">Be the first to comment</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {comments.map((comment) => (
                                <div key={comment.id} className="bg-white dark:bg-[#2d1b2a] rounded-xl p-3.5 border border-gray-100 dark:border-white/5">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                                            {comment.initials || (comment.user?.name || comment.user || 'AN').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-semibold text-gray-900 dark:text-white">{comment.user?.name || comment.user || 'Anonymous'}</span>
                                                <span className="text-[10px] text-gray-400">{getTimeAgo(comment.created_at || comment.timestamp)}</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{comment.content}</p>
                                            <div className="flex items-center gap-4 mt-2">
                                                <button
                                                    onClick={() => handleUpvote(comment.id)}
                                                    className={`flex items-center gap-1 text-[11px] transition-colors ${upvoted[comment.id] ? 'text-primary font-semibold' : 'text-gray-400 hover:text-primary'}`}
                                                >
                                                    <span className="material-icons text-sm">{upvoted[comment.id] ? 'thumb_up' : 'thumb_up_off_alt'}</span>
                                                    {comment.upvotes}
                                                </button>
                                                <button className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-primary transition-colors">
                                                    <span className="material-icons text-sm">reply</span>
                                                    Reply
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={commentsEndRef} />
                        </div>
                    )}
                </div>
            </div>

            {/* Fixed Comment Input */}
            <div className="fixed bottom-0 left-0 right-0 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-lg border-t border-gray-200 dark:border-white/5 px-4 py-3 z-40">
                <div className="flex items-center gap-3 max-w-lg mx-auto">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                        {(user?.name || 'AN').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 relative">
                        <input
                            ref={inputRef}
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                            placeholder="Add a comment..."
                            className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder-gray-400"
                        />
                    </div>
                    <button
                        onClick={handleSubmitComment}
                        disabled={!newComment.trim()}
                        className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30 disabled:opacity-40 disabled:shadow-none hover:opacity-90 active:scale-90 transition-all"
                    >
                        <span className="material-icons text-lg">send</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
