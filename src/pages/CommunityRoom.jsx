import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { postsApi, usersApi, uploadFile, datingApi } from '../services/api';
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
    general: {
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
    const [flaggedPosts, setFlaggedPosts] = useState(new Set()); // IDs of posts flagged by this user
    const [flagModal, setFlagModal] = useState(null); // postId being flagged, or null
    const [deleteModal, setDeleteModal] = useState(null); // postId pending delete confirmation
    const [verifyModalOpen, setVerifyModalOpen] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState(null);

    // Selfie camera state
    const cameraRef = useRef(null);
    const canvasRef = useRef(null);
    const [cameraStream, setCameraStream] = useState(null);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [capturedDataUrl, setCapturedDataUrl] = useState(null);
    const [cameraError, setCameraError] = useState(null);

    const isGenderRoom = roomId === 'women' || roomId === 'men';

    // Stable mapper — memoised so the subscription effect doesn't re-run needlessly.
    const mapPosts = useCallback((data) => {
        return data.map(p => {
            const defaultReactions = { '❤️': 0, '👏': 0, '😢': 0, '😡': 0 };
            const rawReplies = Array.isArray(p.replies) ? p.replies : [];
            // Robust roomId matching
            const pRoomId = p.room_id || p.roomId || roomId;

            return {
                id: p.id,
                // ownerId is always stored for ownership checks (delete button) but never shown in anonymous rooms
                ownerId: p.user_id,
                // Gender rooms: display identity as Anonymous — never expose real identity in UI
                userId: isGenderRoom ? null : p.user_id,
                username: isGenderRoom ? 'Anonymous' : (p.user?.name || p.name || 'Anonymous'),
                userAvatar: isGenderRoom ? null : (p.user?.photo_url || p.avatar_url || null),
                initials: isGenderRoom ? 'AN' : (p.user?.name || p.name || 'AN').substring(0, 2).toUpperCase(),
                content: p.content || '',
                roomId: pRoomId,
                mediaUrl: p.media_url || null,
                mediaType: p.media_type || null,
                mediaName: p.media_name || null,
                timestamp: new Date(p.created_at || p.timestamp),
                reactions: p.reactions
                    ? { ...defaultReactions, ...p.reactions }
                    : defaultReactions,
                replies: rawReplies.map(r => ({
                    ...r,
                    // Also anonymize replies in gender rooms
                    name: isGenderRoom ? 'Anonymous' : (r.name || 'Anonymous'),
                    initials: isGenderRoom ? 'AN' : (r.name || 'AN').substring(0, 2).toUpperCase(),
                    userId: isGenderRoom ? null : r.user_id,
                    timestamp: r.timestamp ? new Date(r.timestamp) : new Date(),
                })),
                commentsCount: p.comments_count || 0,
            };
        });
    }, [isGenderRoom, roomId]);

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
        const onReactionUpdated = ({ postId, reactions }) => {
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, reactions } : p));
        };
        const onReplyAdded = ({ postId, reply }) => {
            const mappedReply = { ...reply, timestamp: new Date(reply.timestamp || reply.created_at) };
            setPosts(prev => prev.map(p => p.id === postId ? { ...p, replies: [...(p.replies || []), mappedReply] } : p));
        };

        socket?.on('new_community_post', onNewPost);
        socket?.on('post_reaction_updated', onReactionUpdated);
        socket?.on('post_reply_added', onReplyAdded);

        return () => {
            socket?.off('new_community_post', onNewPost);
            socket?.off('post_reaction_updated', onReactionUpdated);
            socket?.off('post_reply_added', onReplyAdded);
        };
    }, [roomId, room, mapPosts]);


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
            // Normalize gender
            let userGender = (user.gender || '').toLowerCase().trim();
            if (userGender === 'mujer') userGender = 'female';
            if (userGender === 'hombre') userGender = 'male';

            // Step 1 — no gender set → show selection modal
            if (!userGender) {
                setGenderModalOpen(true);
                return;
            }

            // Step 2 — non-binary → redirect to mixed room
            if (userGender === 'other' || userGender === 'non-binary') {
                toast.info('Este room es privado. Te redirigimos al Community Hub.');
                navigate('/community/general');
                return;
            }

            // Step 3 — wrong gender → blocked
            if (userGender !== requiredGender) {
                const label = requiredGender === 'female' ? 'mujeres' : 'hombres';
                toast.error(`Acceso restringido: Esta sala es solo para ${label}.`);
                navigate('/community');
                return;
            }

            // Step 4 — correct gender but not verified → show AI verification
            if (!user.gender_verified) {
                setVerifyModalOpen(true);
                return;
            }

            // ✅ Gender matches and verified — access granted
        }
    }, [user, roomId, room, navigate, toast]);


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
            user: isGenderRoom ? 'Anonymous' : (user.name || user.user_metadata?.full_name || 'Anonymous'),
            name: isGenderRoom ? 'Anonymous' : (user.name || user.user_metadata?.full_name || 'Anonymous'),
            initials: isGenderRoom ? 'AN' : (user.name || user.user_metadata?.full_name || 'AN').substring(0, 2).toUpperCase(),
            message: newText.trim(),
            timestamp: new Date().toISOString(),
            userId: isGenderRoom ? null : user.id
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
            userId: isGenderRoom ? null : user.id,
            username: isGenderRoom ? 'Anonymous' : (user.name || user.user_metadata?.full_name || 'You'),
            userAvatar: null,
            initials: isGenderRoom ? 'AN' : (user.name || user.user_metadata?.full_name || 'YOU').substring(0, 2).toUpperCase(),
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
            toast.error('Failed to post. Please try again.');
            // Revert optimistic update on error
            setPosts(prev => prev.filter(p => p.id !== tempId));
        } finally {
            setIsPosting(false);
        }
    };

    const totalReactions = (r) => Object.values(r || {}).reduce((a, b) => a + b, 0);

    // Camera lifecycle — start when modal opens, stop when it closes
    useEffect(() => {
        if (verifyModalOpen) {
            startCamera();
        } else {
            stopCamera();
            setCapturedBlob(null);
            setCapturedDataUrl(null);
            setCameraError(null);
            setVerifyError(null);
        }
        return () => stopCamera();
    }, [verifyModalOpen]);

    // Attach stream to video element whenever stream changes
    useEffect(() => {
        if (cameraRef.current && cameraStream) {
            cameraRef.current.srcObject = cameraStream;
        }
    }, [cameraStream]);

    const startCamera = async () => {
        setCameraError(null);
        setCapturedBlob(null);
        setCapturedDataUrl(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
                audio: false
            });
            setCameraStream(stream);
        } catch {
            setCameraError('No se pudo acceder a la cámara. Por favor permite el acceso e intenta de nuevo.');
        }
    };

    const stopCamera = () => {
        setCameraStream(prev => {
            if (prev) prev.getTracks().forEach(t => t.stop());
            return null;
        });
    };

    const capturePhoto = () => {
        if (!cameraRef.current || !canvasRef.current) return;
        const video = cameraRef.current;
        const canvas = canvasRef.current;
        const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Mirror the capture to match what the user sees
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, size, size);
        canvas.toBlob(blob => {
            setCapturedBlob(blob);
            setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
            stopCamera();
        }, 'image/jpeg', 0.9);
    };

    const handleVerifyGender = async () => {
        if (!capturedBlob) return;
        setVerifying(true);
        setVerifyError(null);
        try {
            await usersApi.verifyGenderSelfie(capturedBlob);
            setVerifyModalOpen(false);
            toast.success('¡Identidad verificada! Bienvenida/o. +50 $RFLAG 🪙');
            window.location.reload();
        } catch (err) {
            setVerifyError(err.message || 'Error de verificación. Por favor intenta de nuevo.');
        } finally {
            setVerifying(false);
        }
    };

    const handleFlagPost = async (postId, reason) => {
        setFlagModal(null);
        try {
            await postsApi.flagPost(postId, reason);
            setFlaggedPosts(prev => new Set([...prev, postId]));
            toast.success('Post reported to moderators. Thank you.');
        } catch {
            toast.error('Failed to report post.');
        }
    };

    const handleGenderUpdate = async (gender) => {
        try {
            await usersApi.updateMe({ gender });
            setGenderModalOpen(false);
            toast.success('Profile updated!');
            window.location.reload();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeletePost = async (postId) => {
        setDeleteModal(null);
        try {
            await postsApi.deletePost(postId);
            setPosts(prev => prev.filter(p => p.id !== postId));
            toast.success('Post deleted.');
        } catch {
            toast.error('Failed to delete post.');
        }
    };

    const handleStartDM = async (partnerId) => {
        try {
            await datingApi.initiateDM(partnerId);
            navigate(`/dating/chat/${partnerId}`);
        } catch (err) {
            toast.error('Could not open chat. Please try again.');
            console.error('DM initiate error:', err);
        }
    };

    if (!room) {
        navigate('/community');
        return null; 
    }

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
                                onClick={() => !isGenderRoom && post.userId && navigate(`/profile/${post.userId}`)}
                                className={`w-9 h-9 rounded-full bg-gradient-to-br ${room.gradient} flex items-center justify-center text-white text-[11px] font-bold overflow-hidden ${!isGenderRoom && post.userId ? 'cursor-pointer' : ''}`}
                            >
                                {!isGenderRoom && post.userAvatar ? (
                                    <img src={post.userAvatar} alt={post.username} className="w-full h-full object-cover" />
                                ) : (
                                    post.initials
                                )}
                            </div>
                            <div className="flex-1">
                                <span
                                    onClick={() => !isGenderRoom && post.userId && navigate(`/profile/${post.userId}`)}
                                    className={`text-sm font-semibold ${!isGenderRoom && post.userId ? 'hover:underline cursor-pointer' : ''}`}
                                >
                                    {post.username}
                                    {isGenderRoom && <span className="ml-1.5 text-[10px] font-normal text-gray-400 bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded-full">🔒 anon</span>}
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
                            <div className="ml-auto flex items-center gap-2">
                                {/* Private DM button — only in general room, only on other users' posts */}
                                {!isGenderRoom && post.userId && post.ownerId !== user?.id && (
                                    <button
                                        onClick={() => handleStartDM(post.userId)}
                                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
                                        title="Send private message"
                                    >
                                        <span className="material-icons text-sm">mail_outline</span>
                                    </button>
                                )}
                                {post.ownerId === user?.id && (
                                    <button
                                        onClick={() => setDeleteModal(post.id)}
                                        className="flex items-center gap-1 text-xs text-gray-300 hover:text-red-400 transition-colors"
                                        title="Delete post"
                                    >
                                        <span className="material-icons text-sm">delete_outline</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => !flaggedPosts.has(post.id) && setFlagModal(post.id)}
                                    className={`flex items-center gap-1 text-xs transition-colors ${flaggedPosts.has(post.id) ? 'text-red-400 cursor-default' : 'text-gray-300 hover:text-red-400'}`}
                                    title="Report post"
                                >
                                    <span className="material-icons text-sm">{flaggedPosts.has(post.id) ? 'flag' : 'outlined_flag'}</span>
                                </button>
                            </div>
                        </div>

                        {/* Replies Thread */}
                        {expandedReplies[post.id] && (
                            <div className="bg-gray-50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5">
                                {post.replies?.map((reply, idx) => (
                                    <div key={reply.id || idx} className="px-4 py-3 flex items-start gap-2.5 border-b border-gray-100 dark:border-white/5 last:border-0">
                                        <div
                                            onClick={() => !isGenderRoom && reply.userId && navigate(`/profile/${reply.userId}`)}
                                            className={`w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mt-0.5 ${!isGenderRoom && reply.userId ? 'cursor-pointer' : ''}`}
                                        >
                                            {reply.initials || 'AN'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    onClick={() => !isGenderRoom && reply.userId && navigate(`/profile/${reply.userId}`)}
                                                    className={`text-[11px] font-semibold ${!isGenderRoom && reply.userId ? 'cursor-pointer hover:underline' : ''}`}
                                                >
                                                    {isGenderRoom ? 'Anonymous' : (reply.user || reply.name || 'Anonymous')}
                                                </span>
                                                <span className="text-[10px] text-gray-400">{getTimeAgo(reply.timestamp)}</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5">{reply.message}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Reply Input */}
                                <div className="px-4 py-2.5 flex items-center gap-2">
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            value={replyingTo === post.id ? newText : ''}
                                            onFocus={() => setReplyingTo(post.id)}
                                            onChange={(e) => { setReplyingTo(post.id); setNewText(e.target.value.slice(0, 280)); }}
                                            onKeyDown={(e) => e.key === 'Enter' && handleReply(post.id)}
                                            placeholder="Write a reply..."
                                            maxLength={280}
                                            className="w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-3 py-2 text-xs outline-none focus:border-primary transition-colors"
                                        />
                                        {replyingTo === post.id && newText.length > 240 && (
                                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-medium ${newText.length >= 280 ? 'text-red-400' : 'text-gray-400'}`}>
                                                {280 - newText.length}
                                            </span>
                                        )}
                                    </div>
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
                            onChange={(e) => setNewPostContent(e.target.value.slice(0, 500))}
                            placeholder={`Share something with ${room.name}...`}
                            rows={4}
                            className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3 text-sm outline-none focus:border-primary resize-none transition-colors"
                        />
                        <p className={`text-[10px] text-right mt-1 ${newPostContent.length >= 480 ? 'text-red-400' : 'text-gray-400'}`}>
                            {newPostContent.length}/500
                        </p>

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

            {/* AI Gender Verification Modal — Live Selfie Camera */}
            {verifyModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0 bg-black/80 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1a1525] rounded-3xl shadow-2xl w-full max-w-sm border border-gray-100 dark:border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="px-6 pt-6 pb-3 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-primary/20 flex items-center justify-center mx-auto mb-3 text-2xl">
                                🤳
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verificación de Identidad</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                {capturedDataUrl
                                    ? '¿Todo bien? Pulsa "Verificar" para analizar tu selfie.'
                                    : 'Coloca tu cara en el centro y toma una selfie clara.'}
                            </p>
                        </div>

                        {/* Camera / Preview area */}
                        <div className="flex justify-center px-6 pb-3">
                            {cameraError ? (
                                <div className="w-56 h-56 rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600">
                                    <span className="material-icons text-4xl text-red-400 mb-2">videocam_off</span>
                                    <p className="text-[11px] text-red-500 text-center px-4 leading-snug">{cameraError}</p>
                                    <button onClick={startCamera} className="mt-3 text-xs font-semibold text-violet-500 hover:underline">
                                        Reintentar
                                    </button>
                                </div>
                            ) : capturedDataUrl ? (
                                /* Captured photo preview */
                                <div className="relative">
                                    <img
                                        src={capturedDataUrl}
                                        alt="Tu selfie"
                                        className="w-56 h-56 rounded-2xl object-cover border-4 border-violet-300 dark:border-violet-700 shadow-xl"
                                    />
                                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shadow-lg">
                                        <span className="material-icons text-base">check</span>
                                    </div>
                                </div>
                            ) : (
                                /* Live camera feed */
                                <div className="relative">
                                    <video
                                        ref={cameraRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-56 h-56 rounded-2xl object-cover border-4 border-violet-300 dark:border-violet-700 shadow-xl"
                                        style={{ transform: 'scaleX(-1)' }}
                                    />
                                    {/* Live indicator */}
                                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-[9px] text-white font-bold">LIVE</span>
                                    </div>
                                    {/* Face guide overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="w-32 h-36 rounded-full border-2 border-white/40 border-dashed" />
                                    </div>
                                </div>
                            )}
                            {/* Hidden canvas for capture */}
                            <canvas ref={canvasRef} className="hidden" />
                        </div>

                        {/* Error message */}
                        {verifyError && (
                            <div className="mx-4 mb-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                <p className="text-xs text-red-600 dark:text-red-400 text-center leading-snug">{verifyError}</p>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="px-4 pb-5 space-y-2">
                            {!capturedDataUrl ? (
                                /* Capture button */
                                <button
                                    onClick={capturePhoto}
                                    disabled={!cameraStream}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-primary text-white font-bold rounded-2xl shadow-lg shadow-violet-500/25 disabled:opacity-40 active:scale-[0.98] transition-all"
                                >
                                    <span className="material-icons text-lg">photo_camera</span>
                                    Tomar selfie
                                </button>
                            ) : (
                                <>
                                    {/* Verify button */}
                                    <button
                                        onClick={handleVerifyGender}
                                        disabled={verifying}
                                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-primary text-white font-bold rounded-2xl shadow-lg shadow-violet-500/25 disabled:opacity-50 active:scale-[0.98] transition-all"
                                    >
                                        {verifying ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                                Analizando con IA...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-icons text-sm">verified_user</span>
                                                Verificar con IA
                                            </>
                                        )}
                                    </button>
                                    {/* Retake button */}
                                    <button
                                        onClick={() => { setCapturedDataUrl(null); setCapturedBlob(null); setVerifyError(null); startCamera(); }}
                                        disabled={verifying}
                                        className="w-full text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium transition-colors py-2 flex items-center justify-center gap-1.5"
                                    >
                                        <span className="material-icons text-sm">refresh</span>
                                        Tomar otra foto
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => { setVerifyModalOpen(false); navigate('/community'); }}
                                className="w-full text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors py-1.5"
                            >
                                Volver al Community Hub
                            </button>
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

            {/* Flag confirmation modal */}
            {flagModal && (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-background-light dark:bg-[#1a1525] rounded-t-3xl p-5 pb-8 border-t border-gray-200 dark:border-white/10 shadow-2xl">
                        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-4" />
                        <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                            <span className="material-icons text-red-400">flag</span>
                            Report post
                        </h3>
                        <p className="text-xs text-gray-500 mb-4">Why are you reporting this post?</p>
                        <div className="space-y-2">
                            {[
                                ['inappropriate', 'Inappropriate content'],
                                ['spam', 'Spam or advertising'],
                                ['harassment', 'Harassment or bullying'],
                                ['misinformation', 'Misinformation'],
                                ['hate_speech', 'Hate speech'],
                            ].map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => handleFlagPost(flagModal, value)}
                                    className="w-full text-left px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 text-sm font-medium transition-colors border border-gray-100 dark:border-white/5"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setFlagModal(null)}
                            className="w-full mt-3 py-2.5 rounded-xl text-sm text-gray-400 border border-gray-200 dark:border-gray-700"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteModal && (
                <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-background-light dark:bg-[#1a1525] rounded-t-3xl p-5 pb-8 border-t border-gray-200 dark:border-white/10 shadow-2xl">
                        <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-4" />
                        <h3 className="text-base font-bold mb-1 flex items-center gap-2">
                            <span className="material-icons text-red-400">delete_outline</span>
                            Delete post?
                        </h3>
                        <p className="text-xs text-gray-500 mb-5">This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteModal(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeletePost(deleteModal)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all"
                            >
                                Delete
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
