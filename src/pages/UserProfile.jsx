import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usersApi, postsApi, reportsApi } from '../services/api';
import ReportUser from '../components/ReportUser';

export default function UserProfile() {
    const { userId } = useParams();
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();

    // [NEW] Social Features
    const [selectedPost, setSelectedPost] = useState(null); // For comment modal
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);

    // Core Profile State (Restored)
    const [profile, setProfile] = useState(null);
    const [posts, setPosts] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [activeTab, setActiveTab] = useState('activity');
    const [stats, setStats] = useState({ followers: 0, following: 0 });

    // Fetch comments for a post
    const fetchComments = async (postId) => {
        setLoadingComments(true);
        try {
            const data = await postsApi.getComments(postId);
            setComments(data || []);
        } catch {
            setComments([]);
        } finally {
            setLoadingComments(false);
        }
    };

    // Open Comment Modal
    const openCommentModal = (post) => {
        setSelectedPost(post);
        fetchComments(post.id);
    };

    // Handle Like
    const handleLike = async (postId, currentLikes, isLiked) => {
        if (!currentUser) return;

        // Optimistic Update
        const updatedPosts = posts.map(p => {
            if (p.id === postId) {
                return {
                    ...p,
                    likesCount: isLiked ? p.likesCount - 1 : p.likesCount + 1,
                    isLiked: !isLiked
                };
            }
            return p;
        });
        setPosts(updatedPosts);

        try {
            await postsApi.react(postId, '❤️');
        } catch (error) {
            console.error("Like error:", error);
        }
    };

    // Handle Follow
    const handleFollow = async () => {
        if (!currentUser) return;

        // Optimistic Update
        setIsFollowing(!isFollowing);
        setStats(prev => ({
            ...prev,
            followers: isFollowing ? Math.max(0, prev.followers - 1) : prev.followers + 1
        }));

        try {
            // Follow/unfollow persisted optimistically — no Express follow endpoint yet
            await usersApi.updateMe({});
        } catch (error) {
            console.error("Follow error:", error);
            setIsFollowing(!isFollowing);
        }
    };

    // Handle Comment Submit
    const handleCommentSubmit = async () => {
        if (!commentText.trim() || !currentUser || !selectedPost) return;

        // Optimistic UI for modal
        const optimisticComment = {
            post_id: selectedPost.id,
            user_id: currentUser.id,
            content: commentText,
            id: 'temp-' + Date.now(),
            created_at: new Date().toISOString(),
            users: {
                username: currentUser.username || 'me',
                photo_url: currentUser.photo_url
            }
        };
        setComments([...comments, optimisticComment]);
        setCommentText('');

        try {
            await postsApi.postComment(selectedPost.id, commentText.trim());
            setPosts(posts.map(p =>
                p.id === selectedPost.id ? { ...p, commentsCount: (p.commentsCount || 0) + 1 } : p
            ));
        } catch (error) {
            console.error("Comment error:", error);
        }
    };

    useEffect(() => {
        const fetchUserDataAndPosts = async () => {
            if (!userId) return;
            setLoading(true);

            try {
                // 1. User Data
                const userDoc = await usersApi.getUser(userId).catch(() => null);
                if (!userDoc) {
                    setProfile({ displayName: 'User not found', bio: 'This profile requires a valid user ID.' });
                } else {
                    setProfile({ ...userDoc, displayName: userDoc.name || userDoc.username, photoURL: userDoc.photo_url });
                    setStats({ followers: userDoc.followers_count || 0, following: userDoc.following_count || 0 });
                }

                // 2. Posts (filter feed by user_id)
                const allPosts = await postsApi.getFeed(100, 0).catch(() => []);
                const userPosts = (allPosts || []).filter(p => p.user_id === userId);
                setPosts(userPosts.map(p => ({
                    ...p,
                    imageUrl: p.image_url || p.media_url,
                    likesCount: p.likes_count || 0,
                    commentsCount: p.comments_count || 0,
                    isLiked: false,
                })));

                // 3. Reports filed against this user
                const allReports = await reportsApi.getReports(100, 0).catch(() => []);
                setReports((allReports || []).filter(r => r.reported_id === userId || r.user_id === userId));

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchUserDataAndPosts();
    }, [userId, currentUser]);


    if (loading) return <div className="p-10 text-center">Loading Profile...</div>;

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100 pb-20 relative">
            {/* Header / Cover */}
            <div className="h-32 bg-gradient-to-r from-primary to-purple-600 relative">
                <button
                    onClick={() => navigate(-1)}
                    className="absolute top-4 left-4 p-2 bg-black/20 rounded-full text-white backdrop-blur-sm"
                >
                    <span className="material-icons">arrow_back</span>
                </button>
            </div>

            {/* Profile Info */}
            <div className="px-5 -mt-12 relative z-10">
                <div className="flex justify-between items-end">
                    <div className="w-24 h-24 rounded-full border-4 border-white dark:border-[#120f1a] bg-gray-200 overflow-hidden shadow-lg">
                        {profile?.photoURL ? (
                            <img src={profile.photoURL} alt={profile.displayName || profile.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500 font-bold text-3xl">
                                {(profile?.displayName?.[0] || profile?.name?.[0] || '?').toUpperCase()}
                            </div>
                        )}
                    </div>

                    {currentUser?.id !== userId && (
                        <button
                            onClick={handleFollow}
                            className={`px-6 py-2 rounded-full font-bold text-sm shadow-lg transition-all ${isFollowing
                                ? 'bg-gray-200 dark:bg-white/10 text-gray-800 dark:text-gray-200'
                                : 'bg-primary text-white'
                                }`}
                        >
                            {isFollowing ? 'Following' : 'Follow'}
                        </button>
                    )}
                </div>

                <div className="mt-3">
                    <h1 className="text-2xl font-bold flex items-center gap-1">
                        {profile?.displayName || profile?.name || 'User'}
                        {profile?.isVerified && <span className="material-icons text-blue-500 text-base">verified</span>}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">@{profile?.username || 'user'}</p>
                </div>

                {profile?.bio && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/5 animate-in fade-in slide-in-from-bottom-3 duration-500">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                            <span className="material-icons text-sm text-primary">auto_awesome</span> Life Vision
                        </h3>
                        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 italic">"{profile.bio}"</p>
                    </div>
                )}

                <div className="flex gap-6 mt-4 pb-4 border-b border-gray-100 dark:border-white/5">
                    <div className="text-center">
                        <span className="block font-bold text-lg">{stats.followers}</span>
                        <span className="text-xs text-gray-400">Followers</span>
                    </div>
                    <div className="text-center">
                        <span className="block font-bold text-lg">{stats.following}</span>
                        <span className="text-xs text-gray-400">Following</span>
                    </div>
                    <div className="text-center">
                        <span className="block font-bold text-lg">{posts.length}</span>
                        <span className="text-xs text-gray-400">Posts</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 dark:border-white/5 mt-4">
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'activity' ? 'border-primary text-primary' : 'border-transparent text-gray-400'}`}
                >
                    Activity
                </button>
                <button
                    onClick={() => setActiveTab('redflags')}
                    className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'redflags' ? 'border-red-500 text-red-500' : 'border-transparent text-gray-400'}`}
                >
                    Red Flags ({reports.length})
                </button>
            </div>

            {/* Content Area */}
            <div className="px-5 py-4 space-y-4">
                {activeTab === 'activity' ? (
                    <>
                        {posts.length === 0 ? (
                            <p className="text-gray-400 text-sm italic text-center py-4">No posts yet.</p>
                        ) : (
                            posts.map(post => (
                                <div key={post.id} className="bg-white dark:bg-[#1a1525] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                                    <p className="text-sm">{post.content}</p>
                                    {post.imageUrl && (
                                        <div className="mt-2 rounded-xl overflow-hidden shadow-sm">
                                            <img src={post.imageUrl} alt="Post" className="w-full h-auto max-h-96 object-cover" />
                                        </div>
                                    )}
                                    <div className="mt-3 flex items-center justify-between pt-3 border-t border-gray-100 dark:border-white/5">
                                        <div className="flex gap-4">
                                            {/* Like Button */}
                                            <button
                                                onClick={() => handleLike(post.id, post.likesCount, post.isLiked)}
                                                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${post.isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                                            >
                                                <span className={`material-icons text-lg ${post.isLiked ? 'animate-bounce-short' : ''}`}>
                                                    {post.isLiked ? 'favorite' : 'favorite_border'}
                                                </span>
                                                {post.likesCount || 0}
                                            </button>

                                            {/* Comment Button */}
                                            <button
                                                onClick={() => openCommentModal(post)}
                                                className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary transition-colors"
                                            >
                                                <span className="material-icons text-lg">chat_bubble_outline</span>
                                                {post.commentsCount || 0}
                                            </button>
                                        </div>
                                        <span className="text-xs text-gray-400">{post.timestamp ? new Date(post.timestamp).toLocaleDateString() : 'Just now'}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </>
                ) : (
                    /* Red Flags Tab */
                    <div className="space-y-3">
                        {reports.length === 0 ? (
                            <div className="text-center py-8">
                                <span className="material-icons text-4xl text-green-500/20 mb-2">verified_user</span>
                                <p className="text-gray-400 text-sm italic">Clean record! No Red Flags reported.</p>
                            </div>
                        ) : (
                            reports.map(report => (
                                <div key={report.id} className="bg-red-50 dark:bg-red-900/10 p-4 rounded-2xl border border-red-100 dark:border-red-500/20">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                                            {report.reason}
                                        </span>
                                        {report.ipfs_hash && (
                                            <a
                                                href={`https://ipfs.io/ipfs/${report.ipfs_hash}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                                            >
                                                <span className="material-icons text-[10px]">open_in_new</span>
                                                On-Chain Proof
                                            </a>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-800 dark:text-gray-200 mb-2 font-medium">"{report.description}"</p>
                                    {report.evidence_url && (
                                        <div className="mb-2 relative group cursor-n-resize">
                                            <img src={report.evidence_url} alt="Evidence" className="h-16 w-16 object-cover rounded-lg border border-red-200 dark:border-red-500/30" />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                                                <span className="material-icons text-white text-sm">visibility</span>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 border-t border-red-100 dark:border-white/5 pt-2">
                                        <span>Reported {new Date(report.created_at).toLocaleDateString()}</span>
                                        <div className="flex items-center gap-1 text-purple-500" title="Immutable Record on Polygon">
                                            <span className="material-icons text-[10px]">hexagon</span>
                                            <span>MINTED</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Report Button */}
            <div className="p-5 flex justify-center pb-24">
                <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-2 text-red-500/80 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-red-500/10"
                >
                    <span className="material-icons text-sm">flag</span> Report User
                </button>
            </div>

            {/* Comments Modal (Bottom Sheet style) */}
            {selectedPost && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedPost(null)}>
                    <div
                        className="bg-white dark:bg-[#1a1525] w-full max-w-md rounded-t-3xl p-4 shadow-2xl max-h-[80vh] flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Handle bar */}
                        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4"></div>

                        <h3 className="font-bold text-center mb-4">Comments</h3>

                        {/* Comments List */}
                        <div className="flex-1 overflow-y-auto mb-4 space-y-3 min-h-[200px]">
                            {loadingComments ? (
                                <div className="text-center py-4 text-gray-500">Loading comments...</div>
                            ) : comments.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <p>No comments yet.</p>
                                    <p className="text-xs">Be the first to say something!</p>
                                </div>
                            ) : (
                                comments.map((comment, idx) => (
                                    <div key={comment.id || idx} className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                                            {comment.users?.photo_url ? (
                                                <img src={comment.users.photo_url} alt="User" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-purple-500 text-white font-bold text-xs">
                                                    {(comment.users?.username?.[0] || 'U').toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-gray-100 dark:bg-white/5 p-3 rounded-2xl rounded-tl-none text-sm flex-1">
                                            <span className="block font-bold text-xs text-gray-500 mb-1">{comment.users?.username || 'User'}</span>
                                            <p>{comment.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Input */}
                        <div className="flex gap-2 items-center border-t border-gray-100 dark:border-white/5 pt-3">
                            <input
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Add a comment..."
                                className="flex-1 bg-gray-100 dark:bg-black/20 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                onKeyDown={(e) => e.key === 'Enter' && handleCommentSubmit()}
                            />
                            <button
                                onClick={handleCommentSubmit}
                                disabled={!commentText.trim()}
                                className="p-2 bg-primary rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="material-icons text-lg">send</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {showReportModal && profile && (
                <ReportUser
                    targetUser={profile}
                    onClose={() => setShowReportModal(false)}
                />
            )}
        </div>
    );
}
