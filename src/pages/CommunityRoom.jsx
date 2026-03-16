import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postsApi, usersApi, uploadFile } from '../services/api';
import { getSocket } from '../services/socketService';

const ROOM_CONFIG = {
    women: {
        name: "Women's Room",
        icon: 'female',
        gradient: 'from-pink-500 to-rose-600',
        accentColor: 'pink',
        accentBg: 'bg-pink-500/10',
        accentText: 'text-pink-500',
    },
    men: {
        name: "Men's Room",
        icon: 'male',
        gradient: 'from-blue-500 to-indigo-600',
        accentColor: 'blue',
        accentBg: 'bg-blue-500/10',
        accentText: 'text-blue-500',
    },
    mixed: {
        name: 'Community Hub',
        icon: 'groups',
        gradient: 'from-purple-500 to-primary',
        accentColor: 'purple',
        accentBg: 'bg-purple-500/10',
        accentText: 'text-purple-500',
    },
};

const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const seconds = Math.floor((Date.now() - date) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
};

export default function CommunityRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const fileInputRef = useRef(null);

    const room = ROOM_CONFIG[roomId];

    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedReplies, setExpandedReplies] = useState({});
    const [replyingTo, setReplyingTo] = useState(null);
    const [newText, setNewText] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    // New Post State
    const [newPostContent, setNewPostContent] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [isPosting, setIsPosting] = useState(false);
    const audioInputRef = useRef(null);
    const docInputRef = useRef(null);

    const [myReactions, setMyReactions] = useState({});
    const [genderModalOpen, setGenderModalOpen] = useState(false);

    // Mapper to match UI expectations
    const mapPosts = (data) => {
        return data.map(p => {
            const defaultReactions = { '❤️': 0, '👏': 0, '😢': 0, '😡': 0 };
            const rawReplies = Array.isArray(p.replies) ? p.replies : [];
            return {
                id: p.id,
                userId: p.user_id,
                username: p.user?.name || p.name || 'Anonymous',
                userAvatar: p.user?.photo_url || p.avatar_url || null,
                initials: (p.user?.name || p.name || 'AN').substring(0, 2).toUpperCase(),
                content: p.content || '',
                mediaUrl: p.media_url || null,
                mediaType: p.media_type || null,
                mediaName: p.media_name || null,
                timestamp: new Date(p.created_at || p.timestamp),
                reactions: p.reactions
                    ? { ...defaultReactions, ...p.reactions }
                    : defaultReactions,
                replies: rawReplies.map(r => ({
                    ...r,
                    timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
                })),
                commentsCount: p.comments_count || 0,
            };
        });
    };

    // Fetch and Subscribe
    useEffect(() => {
        if (!room) return;
        setLoading(true);

        const fetchPosts = async () => {
            let fetchedPosts = [];
            try {
                const data = await postsApi.getFeed(50, 0, roomId);
                fetchedPosts = mapPosts(data || []);
            } catch (err) {
                console.warn("Failed to fetch posts:", err);
            }

            setPosts(fetchedPosts);
            setLoading(false);
        };

        fetchPosts();

        // Socket.io real-time subscription
        const socket = getSocket();
        socket?.emit('join_community_room', roomId);
        const onNewPost = (post) => {
            setPosts(prev => {
                if (prev.some(p => p.id === post.id)) return prev;
                const mapped = mapPosts([post])[0];
                return [mapped, ...prev];
            });
        };
        socket?.on('new_community_post', onNewPost);

        return () => {
            socket?.off('new_community_post', onNewPost);
        };
    }, [roomId, room]);


    const detectFileType = (file) => {
        if (!file) return null;
        const mime = file.type || '';
        if (mime.startsWith('image/')) return 'image';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('video/')) return 'video';
        return 'document';
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const type = detectFileType(file);
        setSelectedFile(file);
        setFileType(type);

        if (type === 'image' || type === 'video') {
            const reader = new FileReader();
            reader.onloadend = () => setFilePreview(reader.result);
            reader.readAsDataURL(file);
        } else if (type === 'audio') {
            setFilePreview(URL.createObjectURL(file));
        } else {
            setFilePreview(file.name);
        }
    };

    const clearFile = () => {
        setSelectedFile(null);
        setFilePreview(null);
        setFileType(null);
    };

    // Verify Gender Access
    useEffect(() => {
        if (!user || !room) return;

        // Configuration for gender restriction
        const restrictions = {
            women: 'female',
            men: 'male'
        };

        const requiredGender = restrictions[roomId];
        if (requiredGender) {
            // Normalize for comparison
            let userGender = (user.gender || user.user_metadata?.gender || '').toLowerCase();

            // Map Spanish terms
            if (userGender === 'mujer') userGender = 'female';
            if (userGender === 'hombre') userGender = 'male';

            if (!userGender) {
                setGenderModalOpen(true);
                return;
            }

            // PREVENT FAKE ACCOUNTS: Check AI Verification
            if (!user.is_verified) {
                toast.error("Debes verificar tu identidad para entrar a esta sala.");
                navigate('/verify', { state: { from: '/community' } });
                return;
            }

            if (userGender !== requiredGender) {
                console.warn('Access Denied. Redirecting...');
                toast.error(`Acceso restringido: Esta sala es solo para ${requiredGender === 'female' ? 'mujeres' : 'hombres'}.`);
                navigate('/community');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, roomId, room, navigate]);

    if (!room) {
        navigate('/community');
        return null; // Return null if redirecting to prevent render
    }

    const handleReact = async (postId, emoji) => {
        const key = `${postId}_${emoji}`;
        if (myReactions[key]) return;

        // Optimistic update
        setMyReactions(prev => ({ ...prev, [key]: true }));
        setPosts(prev => prev.map(p => {
            if (p.id !== postId) return p;
            const updated = { ...p.reactions };
            updated[emoji] = (updated[emoji] || 0) + 1;
            return { ...p, reactions: updated };
        }));

        try {
            await postsApi.react(postId, emoji);
        } catch (error) {
            console.error("Error adding reaction:", error);
        }
    };

    const handleReply = async (postId) => {
        if (!newText.trim() || !user) return;

        const reply = {
            id: `r_${Date.now()}`,
            user: user.name || user.user_metadata?.full_name || 'Anonymous',
            initials: (user.name || user.user_metadata?.full_name || 'AN').substring(0, 2).toUpperCase(),
            message: newText.trim(),
            timestamp: new Date().toISOString(),
            userId: user.id
        };

        // Optimistic update
        const replyForUI = { ...reply, timestamp: new Date(reply.timestamp) };
        setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, replies: [...(p.replies || []), replyForUI] } : p
        ));
        setNewText('');
        setReplyingTo(null);
        setExpandedReplies(prev => ({ ...prev, [postId]: true }));

        try {
            await postsApi.reply(postId, newText.trim());
            toast.success('Reply posted');
        } catch (error) {
            console.error("Error adding reply:", error);
            toast.error("Failed to post reply");
            // Revert optimistic update
            setPosts(prev => prev.map(p =>
                p.id === postId
                    ? { ...p, replies: (p.replies || []).filter(r => r.id !== reply.id) }
                    : p
            ));
        }
    };

    const handleCreatePost = async () => {
        if ((!newPostContent.trim() && !selectedFile) || isPosting) return;

        if (!user) {
            toast.error("You must be logged in to post.");
            return;
        }

        setIsPosting(true);

        // 1. Optimistic Update
        const tempId = `temp-${Date.now()}`;
        const optimisticPost = {
            id: tempId,
            userId: user.id,
            username: user.name || user.user_metadata?.full_name || 'You',
            userAvatar: null, // Could use auth user photo if available locally
            initials: (user.name || user.user_metadata?.full_name || 'YOU').substring(0, 2).toUpperCase(),
            content: newPostContent.trim(),
            mediaUrl: filePreview, // Show local preview immediately
            mediaType: fileType,
            mediaName: selectedFile?.name,
            timestamp: new Date(),
            reactions: { '❤️': 0, '👏': 0, '😢': 0, '😡': 0 },
            replies: [],
            commentsCount: 0,
            isOptimistic: true
        };

        setPosts(prev => [optimisticPost, ...prev]);
        setNewPostContent(''); // Clear input immediately
        clearFile();
        setShowCreate(false);

        try {
            let mediaUrl = null;
            let fileName = selectedFile?.name || null;

            if (selectedFile) {
                try {
                    mediaUrl = await uploadFile(selectedFile, 'community');
                } catch (uploadError) {
                    console.error("File upload failed:", uploadError);
                    toast.error("Failed to upload file.");
                    setPosts(prev => prev.filter(p => p.id !== tempId));
                    setIsPosting(false);
                    return;
                }
            }

            const data = await postsApi.createPost(optimisticPost.content, mediaUrl, roomId, fileType, fileName);

            // 2. Replace Optimistic Post with Real Post
            const realPost = mapPosts([{ ...data, room_id: roomId, media_type: fileType, media_name: fileName }])[0];
            setPosts(prev => prev.map(p => p.id === tempId ? realPost : p));
            toast.success('Post published! 🎉');

        } catch (error) {
            console.error("Error creating post:", error);
            toast.error(`Failed to create post: ${error.message}`);
            // Revert optimistic update on error
            setPosts(prev => prev.filter(p => p.id !== tempId));
        } finally {
            setIsPosting(false);
        }
    };

    const totalReactions = (r) => Object.values(r || {}).reduce((a, b) => a + b, 0);

    const handleGenderUpdate = async (gender) => {
        // Assuming updateProfile is available via context or prop, but it's not imported here
        // We need to use supabase directly or import useAuth's updateProfile
        // useAuth only exposes 'user' in the destructuring at the top.
        // Let's grab updateProfile from useAuth
        // Wait, I can't change the hook call at the top without breaking rules of hooks if I did conditional..
        // But I can just add it to the destructuring.
        // However, if I can't edit the top of file easily...
        // Actually I am rewriting the whole file, so I strictly need to add updateProfile to useAuth

        // For now, I will use supabase to update directly if updateProfile isn't available
        try {
            await usersApi.updateMe({ gender });
            setGenderModalOpen(false);
            toast.success("Profile updated!");
            window.location.reload();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100 flex flex-col">
            {/* Header */}
            <header className={`sticky top-0 z-30 bg-background-light/90 dark:bg-background-dark/90 backdrop-blur-lg border-b border-gray-200 dark:border-white/5`}>
                <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => navigate('/community')} className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors">
                        <span className="material-icons">chevron_left</span>
                    </button>
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${room.gradient} flex items-center justify-center text-white`}>
                        <span className="material-icons text-lg">{room.icon}</span>
                    </div>
                    <div className="flex-1">
                        <h1 className="text-base font-bold leading-tight">{room.name}</h1>
                        <p className="text-[10px] text-gray-400 font-medium">{posts.length} posts • Active now</p>
                    </div>
                </div>
            </header>

            {/* Posts Feed */}
            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-4 animate-page-in">
                {loading && <div className="text-center py-10 text-gray-400">Loading community...</div>}

                {!loading && posts.length === 0 && (
                    <div className="text-center py-10">
                        <span className="material-icons text-4xl text-gray-300 mb-2">forum</span>
                        <p className="text-gray-500">No posts yet. Be the first!</p>
                    </div>
                )}

                {posts.map((post) => (
                    <div key={post.id} className={`bg-white dark:bg-[#1a1525] rounded-2xl border ${post.isOptimistic ? 'border-primary/50 opacity-80' : 'border-gray-100 dark:border-white/5'} overflow-hidden shadow-sm transition-all`}>
                        {/* Post Header */}
                        <div className="px-4 pt-3.5 pb-2 flex items-center gap-3">
                            <div
                                onClick={() => navigate(`/profile/${post.userId}`)}
                                className={`w-9 h-9 rounded-full bg-gradient-to-br ${room.gradient} flex items-center justify-center text-white text-[11px] font-bold cursor-pointer overflow-hidden`}
                            >
                                {post.userAvatar ? (
                                    <img src={post.userAvatar} alt={post.username} className="w-full h-full object-cover" />
                                ) : (
                                    post.initials
                                )}
                            </div>
                            <div className="flex-1">
                                <span
                                    onClick={() => navigate(`/profile/${post.userId}`)}
                                    className="text-sm font-semibold hover:underline cursor-pointer"
                                >
                                    {post.username}
                                </span>
                                <span className="text-[11px] text-gray-400 ml-2">{getTimeAgo(post.timestamp)}</span>
                                {post.isOptimistic && <span className="text-[10px] text-primary ml-2 italic">Sending...</span>}
                            </div>
                        </div>

                        {/* Post Content */}
                        <div className="px-4 pb-3">
                            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{post.content}</p>
                            {/* Image */}
                            {(post.mediaUrl && post.mediaType === 'image') && (
                                <img
                                    src={post.mediaUrl}
                                    alt="Post attachment"
                                    className="mt-3 rounded-xl w-full h-auto max-h-80 object-cover border border-gray-100 dark:border-white/5"
                                    loading="lazy"
                                />
                            )}
                            {/* Video */}
                            {post.mediaType === 'video' && post.mediaUrl && (
                                <video controls className="mt-3 rounded-xl w-full max-h-80 border border-gray-100 dark:border-white/5">
                                    <source src={post.mediaUrl} />
                                </video>
                            )}
                            {/* Audio */}
                            {post.mediaType === 'audio' && post.mediaUrl && (
                                <div className="mt-3 flex items-center gap-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5">
                                    <span className="material-icons text-primary">headphones</span>
                                    <audio controls className="flex-1 h-8" src={post.mediaUrl} />
                                </div>
                            )}
                            {/* Document */}
                            {post.mediaType === 'document' && post.mediaUrl && (
                                <a
                                    href={post.mediaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 flex items-center gap-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                                >
                                    <span className="material-icons text-blue-500">description</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{post.mediaName || 'Document'}</p>
                                        <p className="text-[10px] text-gray-400">Tap to download</p>
                                    </div>
                                    <span className="material-icons text-gray-400 text-sm">download</span>
                                </a>
                            )}
                        </div>

                        {/* Reactions Row */}
                        <div className="px-4 pb-2 flex items-center gap-1 flex-wrap">
                            {['❤️', '👏', '😢', '😡'].map((emoji) => (
                                <button
                                    key={emoji}
                                    onClick={() => handleReact(post.id, emoji)}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition-all ${myReactions[`${post.id}_${emoji}`]
                                        ? 'bg-primary/15 border border-primary/30 text-primary font-semibold scale-105'
                                        : 'bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 active:scale-95'
                                        }`}
                                >
                                    <span>{emoji}</span>
                                    {post.reactions && post.reactions[emoji] > 0 && <span>{post.reactions[emoji]}</span>}
                                </button>
                            ))}
                        </div>

                        {/* Actions Row */}
                        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-white/5 flex items-center gap-4">
                            <button
                                onClick={() => { setExpandedReplies(prev => ({ ...prev, [post.id]: !prev[post.id] })); }}
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary transition-colors"
                            >
                                <span className="material-icons text-sm">chat_bubble_outline</span>
                                {post.replies?.length > 0 ? `${post.replies.length} replies` : 'Reply'}
                            </button>
                            <span className="text-[10px] text-gray-400">{totalReactions(post.reactions)} reactions</span>
                        </div>

                        {/* Replies Thread */}
                        {expandedReplies[post.id] && (
                            <div className="bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5">
                                {post.replies?.map((reply, idx) => (
                                    <div key={reply.id || idx} className="px-4 py-3 flex items-start gap-2.5 border-b border-gray-100 dark:border-white/5 last:border-0">
                                        <div
                                            onClick={() => navigate(`/profile/${reply.userId}`)}
                                            className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5 cursor-pointer"
                                        >
                                            {reply.initials}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    onClick={() => navigate(`/profile/${reply.userId}`)}
                                                    className="text-[11px] font-semibold cursor-pointer hover:underline"
                                                >
                                                    {reply.user}
                                                </span>
                                                <span className="text-[10px] text-gray-400">{getTimeAgo(reply.timestamp)}</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">{reply.message}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Reply Input */}
                                <div className="px-4 py-2.5 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={replyingTo === post.id ? newText : ''}
                                        onFocus={() => setReplyingTo(post.id)}
                                        onChange={(e) => { setReplyingTo(post.id); setNewText(e.target.value); }}
                                        onKeyDown={(e) => e.key === 'Enter' && handleReply(post.id)}
                                        placeholder="Write a reply..."
                                        className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-3 py-2 text-xs outline-none focus:border-primary transition-colors"
                                    />
                                    <button
                                        onClick={() => handleReply(post.id)}
                                        className={`w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center transition-all ${replyingTo === post.id && newText.trim() ? 'opacity-100 scale-100' : 'opacity-30 scale-90'}`}
                                    >
                                        <span className="material-icons text-sm">send</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </main>

            {/* Create Post Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
                    <div className="relative w-full max-w-lg bg-background-light dark:bg-[#1a1525] rounded-t-3xl p-5 pb-8 border-t border-gray-200 dark:border-white/10 shadow-2xl animate-page-in">
                        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-4" />
                        <h3 className="text-base font-bold mb-3 flex items-center gap-2">
                            <span className={`material-icons ${room.accentText}`}>edit</span>
                            New Post
                        </h3>

                        <textarea
                            autoFocus
                            value={newPostContent}
                            onChange={(e) => setNewPostContent(e.target.value)}
                            placeholder={`Share something with ${room.name}...`}
                            rows={4}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary resize-none transition-colors"
                        />

                        {/* File Preview */}
                        {filePreview && (
                            <div className="mt-2 relative inline-block">
                                {fileType === 'image' && <img src={filePreview} alt="Preview" className="h-20 rounded-lg border border-gray-200" />}
                                {fileType === 'video' && <video src={filePreview} className="h-20 rounded-lg border border-gray-200" />}
                                {fileType === 'audio' && (
                                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 px-3 py-2 rounded-lg">
                                        <span className="material-icons text-primary">headphones</span>
                                        <span className="text-xs truncate max-w-[120px]">{selectedFile?.name}</span>
                                    </div>
                                )}
                                {fileType === 'document' && (
                                    <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 px-3 py-2 rounded-lg">
                                        <span className="material-icons text-blue-500">description</span>
                                        <span className="text-xs truncate max-w-[120px]">{selectedFile?.name}</span>
                                    </div>
                                )}
                                <button
                                    onClick={clearFile}
                                    className="absolute -top-1 -right-1 bg-gray-800 text-white rounded-full p-0.5"
                                >
                                    <span className="material-icons text-xs">close</span>
                                </button>
                            </div>
                        )}

                        <div className="flex items-center justify-between mt-3">
                            <div className="flex gap-1">
                                {/* Photo button */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500"
                                    title="Add Photo/Video"
                                >
                                    <span className="material-icons text-xl">image</span>
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*,video/*"
                                    onChange={handleFileSelect}
                                />
                                {/* Audio button */}
                                <button
                                    onClick={() => audioInputRef.current?.click()}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500"
                                    title="Add Audio"
                                >
                                    <span className="material-icons text-xl">mic</span>
                                </button>
                                <input
                                    type="file"
                                    ref={audioInputRef}
                                    className="hidden"
                                    accept="audio/*"
                                    onChange={handleFileSelect}
                                />
                                {/* Document button */}
                                <button
                                    onClick={() => docInputRef.current?.click()}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500"
                                    title="Add Document"
                                >
                                    <span className="material-icons text-xl">attach_file</span>
                                </button>
                                <input
                                    type="file"
                                    ref={docInputRef}
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
                                    onChange={handleFileSelect}
                                />
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreatePost}
                                    disabled={(!newPostContent.trim() && !selectedFile) || isPosting}
                                    className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold shadow-lg shadow-primary/20 disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
                                >
                                    {isPosting && <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />}
                                    Post
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Gender Selection Modal */}
            {genderModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0 bg-black/70 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1a1525] rounded-3xl shadow-2xl w-full max-w-sm border border-gray-100 dark:border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
                                🔒
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">One quick step</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                                We use your gender to place you in the right community room and keep the space safe.
                            </p>
                        </div>

                        {/* Options */}
                        <div className="px-4 pb-3 space-y-2.5">
                            <button
                                onClick={() => handleGenderUpdate('female')}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-transparent bg-pink-50 dark:bg-pink-500/10 hover:border-pink-400 hover:bg-pink-100 dark:hover:bg-pink-500/20 active:scale-[0.98] transition-all group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-2xl shadow-md shadow-pink-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
                                    👩
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Female</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Women's community rooms</p>
                                </div>
                                <span className="material-icons text-pink-400 opacity-0 group-hover:opacity-100 ml-auto transition-opacity text-lg">arrow_forward</span>
                            </button>

                            <button
                                onClick={() => handleGenderUpdate('male')}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-transparent bg-blue-50 dark:bg-blue-500/10 hover:border-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 active:scale-[0.98] transition-all group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-2xl shadow-md shadow-blue-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
                                    👨
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Male</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Men's community rooms</p>
                                </div>
                                <span className="material-icons text-blue-400 opacity-0 group-hover:opacity-100 ml-auto transition-opacity text-lg">arrow_forward</span>
                            </button>

                            <button
                                onClick={() => handleGenderUpdate('other')}
                                className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-transparent bg-purple-50 dark:bg-purple-500/10 hover:border-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 active:scale-[0.98] transition-all group"
                            >
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-fuchsia-500 flex items-center justify-center text-2xl shadow-md shadow-purple-500/30 group-hover:scale-105 transition-transform flex-shrink-0">
                                    ✨
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-slate-800 dark:text-white text-sm">Non-binary / Other</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">All-inclusive rooms</p>
                                </div>
                                <span className="material-icons text-purple-400 opacity-0 group-hover:opacity-100 ml-auto transition-opacity text-lg">arrow_forward</span>
                            </button>
                        </div>

                        {/* Footer */}
                        <div className="px-4 pt-1 pb-5 text-center">
                            <button
                                onClick={() => navigate('/community')}
                                className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-2 px-4"
                            >
                                Skip for now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Create Button */}
            <button
                onClick={() => setShowCreate(true)}
                className={`fixed bottom-24 right-5 w-14 h-14 rounded-full bg-gradient-to-br ${room.gradient} text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-transform z-40`}
            >
                <span className="material-icons text-2xl">add</span>
            </button>
        </div>
    );
}
