import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDating } from '../context/DatingContext';
import { useToast } from '../context/ToastContext';
import { sendMessage, subscribeToMessages, subscribeToRoomParticipants, uploadChatAttachment } from '../services/chatService';
import { userExtras, reportsApi, datingApi } from '../services/api';



import DateFeedback from '../components/DateFeedback';
import VideoCall from '../components/VideoCall';
import EmojiEditor from '../components/EmojiEditor';
import ChatAttachment from '../components/ChatAttachment';
import { callService } from '../services/callService';
import { sanitizeInput } from '../utils/sanitize';


export default function DatingChat() {
    const { matchId: targetUserId } = useParams(); // App.jsx uses :matchId, but it contains userId
    const { user } = useAuth();
    const { matches, markMatchRead } = useDating();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    // Derived Match ID — must be defined before any handler that uses it
    const matchId = user && targetUserId ? [user.id, targetUserId].sort().join('_') : null;

    // Find match info from context
    const match = matches.find(m => m.id === targetUserId);

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [showFeedback, setShowFeedback] = useState(false);

    // Call State — pre-populate from GlobalCallHandler navigation state if present
    const [isInCall, setIsInCall] = useState(false);
    const [activeCallType, setActiveCallType] = useState('video'); // 'video' or 'audio'
    const [incomingCall, setIncomingCall] = useState(location.state?.autoAnswerCall ?? null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [participants, setParticipants] = useState([]);

    // Refs

    const messagesEndRef = useRef(null);
    const scrollRef = useRef(null); // Fixed: Added scrollRef definition

    // Auth & Context
    // const { user } = useAuth(); // Already declared above

    // Emoji Editor State
    const [showEmojiEditor, setShowEmojiEditor] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [showChatMenu, setShowChatMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // Chat Menu Feature States
    const [isMuted, setIsMuted] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [showSearchBar, setShowSearchBar] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportDescription, setReportDescription] = useState('');
    const searchInputRef = useRef(null);

    // Media Recorder Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const handleFileUpload = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        // Simple validation
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            toast.error("File too large (Max 10MB)");
            return;
        }

        setShowAttachMenu(false);

        // Optimistic update for attachment
        const optimisticMsg = {
            id: `temp_${Date.now()}`,
            text: `📎 Sending ${type}...`,
            content: `📎 Sending ${type}...`,
            nickname: user?.name || 'User',
            avatar: '👤',
            type,
            sender_id: user?.id,
            user_id: user?.id,
            timestamp: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        const toastId = toast.loading("Uploading...");
        try {
            const url = await uploadChatAttachment(file);
            await sendMessage(matchId, url || '');
            toast.dismiss(toastId);
            toast.success("Sent!");
            // Remove optimistic, real message comes via subscription
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        } catch (error) {
            console.error('Upload failed:', error);
            toast.dismiss(toastId);
            toast.error(error.message || "Upload failed");
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        }
    };

    const toggleRecording = async () => {
        if (isRecording) {
            // STOP recording
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
                setIsRecording(false);
            }
            return;
        }

        // START recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], "voice_message.webm", { type: 'audio/webm' });

                // Optimistic update
                const optimisticMsg = {
                    id: `temp_voice_${Date.now()}`,
                    text: '🎤 Voice message',
                    content: '🎤 Voice message',
                    nickname: user?.name || 'User',
                    avatar: '👤',
                    type: 'audio',
                    sender_id: user?.id,
                    user_id: user?.id,
                    timestamp: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                };
                setMessages(prev => [...prev, optimisticMsg]);
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

                // Upload and send
                const toastId = toast.loading("Sending voice message...");
                try {
                    const url = await uploadChatAttachment(audioFile);
                    await sendMessage(matchId, url || '');
                    toast.dismiss(toastId);
                    toast.success("Sent!");
                    setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
                } catch (error) {
                    console.error("Voice upload failed:", error);
                    toast.dismiss(toastId);
                    toast.error(error.message || "Failed to send voice message");
                    setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
                }

                // Stop tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            toast.info("Recording... Click again to send");
        } catch (error) {
            console.error("Error starting recording:", error);
            if (error.name === 'NotAllowedError') {
                toast.error("Microphone permission denied. Allow access in browser settings.");
            } else if (error.name === 'NotFoundError') {
                toast.error("No microphone found on this device.");
            } else {
                toast.error("Could not access microphone");
            }
        }
    };

    // matchId is defined at the top of the component (before handlers)

    // Mark chat as read when opened
    useEffect(() => {
        if (matchId) markMatchRead(matchId);
    }, [matchId, markMatchRead]);

    // Subscribe to Messages & Calls
    useEffect(() => {
        if (!matchId || !user?.id) return;

        // Verify match exists before subscribing — redirect if stale/missing
        datingApi.getMessages(matchId).catch((err) => {
            if (err.message?.includes('not found') || err.message?.includes('Not your match')) {
                toast.error('This match no longer exists');
                navigate('/dating/matches');
            }
        });

        // Messages
        const unsubscribeMessages = subscribeToMessages(matchId, (msgs) => {
            setMessages(msgs);
            markMatchRead(matchId); // clear unread badge as messages load
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });

        // Calls
        const unsubscribeCalls = callService.subscribeToSignals(
            matchId,
            user.id,
            (offer) => {
                setIncomingCall(offer);
            }
        );

        // Participants
        const unsubscribeParticipants = subscribeToRoomParticipants(matchId, (list) => {
            setParticipants(list);
        });

        return () => {
            unsubscribeMessages();
            unsubscribeCalls();
            unsubscribeParticipants();
        };
    }, [matchId, user?.id, markMatchRead]);

    // Check mute & block status on mount
    useEffect(() => {
        if (!matchId || !user?.id) return;

        // Check muted
        userExtras.getMuteStatus(matchId).then(d => { if (d?.muted) setIsMuted(true); }).catch(() => { });

        // Check blocked
        if (targetUserId) {
            userExtras.getBlocked().then(list => { if (list?.some(b => b.id === targetUserId)) setIsBlocked(true); }).catch(() => { });
        }
    }, [matchId, user?.id, targetUserId]);

    // Focus search input when opened
    useEffect(() => {
        if (showSearchBar && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearchBar]);

    // ========== CHAT MENU HANDLERS ==========

    const handleMuteChat = async () => {
        setShowChatMenu(false);
        try {
            if (!isValidUUID(user?.id)) {
                // Demo mode
                setIsMuted(!isMuted);
                toast.success(isMuted ? 'Chat unmuted 🔔' : 'Chat muted 🔕');
                return;
            }
            if (isMuted) {
                await userExtras.unmuteChat(matchId);
                setIsMuted(false);
                toast.success('Chat unmuted 🔔');
            } else {
                await userExtras.muteChat(matchId);
                setIsMuted(true);
                toast.success('Chat muted 🔕');
            }
        } catch (err) {
            console.error('Mute error:', err);
            toast.error('Failed to update mute setting');
        }
    };

    const handleSearchInChat = () => {
        setShowChatMenu(false);
        setShowSearchBar(true);
        setSearchQuery('');
    };

    const handleViewProfile = () => {
        setShowChatMenu(false);
        navigate(`/dating/profile/${targetUserId}`);
    };

    const handleBlockUser = async () => {
        setShowChatMenu(false);
        if (!window.confirm(`Block ${match?.name || 'this user'}? You won't receive messages from them.`)) return;
        try {
            if (!isValidUUID(user?.id) || !isValidUUID(targetUserId)) {
                // Demo mode
                setIsBlocked(!isBlocked);
                toast.success(isBlocked ? 'User unblocked' : 'User blocked');
                if (!isBlocked) navigate('/dating/matches');
                return;
            }
            if (isBlocked) {
                await userExtras.unblockUser(targetUserId);
                setIsBlocked(false);
                toast.success('User unblocked');
            } else {
                await userExtras.blockUser(targetUserId);
                setIsBlocked(true);
                toast.success('User blocked');
                navigate('/dating/matches');
            }
        } catch (err) {
            console.error('Block error:', err);
            toast.error('Failed to block user');
        }
    };

    const handleReportUser = () => {
        setShowChatMenu(false);
        setShowReportModal(true);
        setReportReason('');
        setReportDescription('');
    };

    // Helper to check if an ID is a real UUID (not demo mock)
    const isValidUUID = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const submitReport = async () => {
        if (!reportReason) {
            toast.error('Please select a reason');
            return;
        }
        try {
            // Demo mode — just show success
            if (!isValidUUID(user?.id) || !isValidUUID(targetUserId)) {
                toast.success('Report submitted. Our team will review it.');
                setShowReportModal(false);
                return;
            }
            await reportsApi.createReport({
                reported_id: targetUserId,
                reason: reportReason,
                description: reportDescription || null,
                status: 'pending',
            });
            toast.success('Report submitted. Our team will review it.');
            setShowReportModal(false);
        } catch (err) {
            console.error('Report error:', err);
            toast.error(`Report failed: ${err.message || err}`);
        }
    };

    const handleClearChat = async () => {
        setShowChatMenu(false);
        if (!window.confirm('Clear all messages? This cannot be undone.')) return;
        try {
            if (isValidUUID(user?.id) && matchId) {
                await datingApi.deleteMessages(matchId).catch(() => { });
            }
            setMessages([]);
            toast.success('Chat cleared');
        } catch (err) {
            console.error('Clear error:', err);
            // Still clear locally even if DB fails
            setMessages([]);
            toast.success('Chat cleared locally');
        }
    };

    // Filtered messages for search
    const filteredMessages = searchQuery
        ? messages.filter(m => (m.text || m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
        : messages;

    const handleStartCall = (type) => {
        setActiveCallType(type);
        setIsInCall(true);
    };

    const handleAcceptCall = () => {
        setActiveCallType(incomingCall.callType);
        setIsInCall(true);
    };

    const handleRejectCall = () => {
        callService.endCall(matchId); // Notify other peer connection refused/ended
        setIncomingCall(null);
    };

    const handleSend = async (e) => {
        e && e.preventDefault();
        if (!input.trim() || !matchId) return;

        const text = input.trim();
        setInput('');

        // Optimistic update — show message instantly
        const optimisticMsg = {
            id: `temp_${Date.now()}`,
            text,
            content: text,
            nickname: user?.name || 'User',
            avatar: '👤',
            type: 'text',
            sender_id: user?.id,
            user_id: user?.id,
            timestamp: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, optimisticMsg]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        try {
            await sendMessage(matchId, text);
        } catch (error) {
            console.error("Error sending message:", error);
            toast.error("Failed to send");
            // Remove optimistic message on failure
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        }
    };

    // Callback when emoji is saved/created
    const handleEmojiSaved = async (emojiData) => {
        // Automatically send the newly created emoji? 
        // Or adding it to a picker would be better, but for this task flow let's say we send it or add text

        // If we want to send it immediately as an SVG message (treating as image/sticker):
        // Protocol: [sticker:SVG_STRING] or just raw SVG if sanitized. 
        // Safer: [sticker:ID] but we might not have ID if mock.

        // For MVP: Send a special text marker that renders as SVG
        if (emojiData && emojiData.svg) {
            // NOTE: Sending raw SVG in text is risky for DB size and XSS if not careful.
            // Better: Store in DB, send ID. 
            // Here we assume "emojiData" is the saved object from DB.
            // If it's a mock object from Editor error handler, we use raw SVG (demo mode).

            const content = `[sticker:${encodeURIComponent(emojiData.svg)}]`;

            try {
                await sendMessage(matchId, content);
            } catch (error) {
                console.error("Error sending sticker:", error);
            }
        }
    };

    // Helper to render message content
    const renderMessageContent = (msg) => {
        // 1. Stickers (Encoded SVG)
        const isSticker = msg.type === 'sticker' || (msg.attachment === 'sticker') || (msg.text && msg.text.startsWith('[sticker:'));

        if (isSticker) {
            let svgCode = '';
            // Try to extract from text/content if it's the [sticker:] format
            if (msg.text && msg.text.startsWith('[sticker:')) {
                const encoded = msg.text.substring(9, msg.text.length - 1);
                try {
                    svgCode = decodeURIComponent(encoded);
                } catch (e) { console.error(e); }
            } else if (msg.content && msg.content.startsWith('[sticker:')) { // Encrypted content might decode to this
                const encoded = msg.content.substring(9, msg.content.length - 1);
                try { svgCode = decodeURIComponent(encoded); } catch { /* ignore */ }
            }

            if (svgCode) {
                const safeSvg = sanitizeInput(svgCode, { maxLength: 50000, allowBasicHtml: true });
                return (
                    <div
                        className="w-24 h-24 drop-shadow-md transform transition-transform hover:scale-110 cursor-pointer"
                        dangerouslySetInnerHTML={{ __html: safeSvg }}
                        title="Custom Sticker"
                    />
                );
            }
        }

        // 2. Multimedia Attachments (Image, Video, Audio, Document)
        // msg.attachment can be an object {url, type} or a string URL
        if (msg.attachment && msg.attachment !== 'sticker') {
            const attachUrl = typeof msg.attachment === 'object' ? msg.attachment.url : msg.attachment;
            const attachType = typeof msg.attachment === 'object' ? msg.attachment.type : msg.type;
            return <ChatAttachment type={attachType || 'file'} url={attachUrl} fileName="Attachment" /> || <></>;
        }

        // 3. Date Invites & Live Location Invites
        const text = msg.text || msg.content || '';
        if (text.startsWith('[date_invite]')) {
            const inviteText = text.replace('[date_invite]', '').trim();
            return (
                <div className="bg-purple-900/30 border border-purple-500/50 rounded-xl p-3 text-sm mt-1">
                    <div className="flex items-center gap-2 text-purple-300 font-bold mb-1">
                        <span className="material-icons text-lg">event</span> Date Invite
                    </div>
                    <p className="text-gray-200">{inviteText}</p>
                </div>
            );
        }

        if (text.startsWith('[live_location_invite]')) {
            const inviteText = text.replace('[live_location_invite]', '').trim();
            return (
                <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-3 text-sm mt-1">
                    <div className="flex items-center gap-2 text-green-300 font-bold mb-1">
                        <span className="material-icons text-lg">my_location</span> Live Radar Active
                    </div>
                    <p className="text-gray-200 mb-2">{inviteText}</p>
                    <button
                        onClick={() => navigate(`/dating/live-radar/${matchId}`)}
                        className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <span className="material-icons text-sm">radar</span> Open Radar
                    </button>
                </div>
            );
        }

        if (text.startsWith('[saferide_invite:')) {
            const endIdx = text.indexOf(']');
            const sessionId = text.substring(17, endIdx);
            const inviteText = text.substring(endIdx + 1).trim();
            const isSender = msg.sender_id === user?.id || msg.user_id === user?.id; // user_id is fallback

            return (
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-sm mt-1 shadow-lg">
                    <div className="flex items-center gap-2 text-white font-bold mb-1">
                        <span className="material-icons text-lg">local_taxi</span> SafeRide (Uber)
                    </div>
                    <p className="text-gray-300 mb-3">{inviteText}</p>

                    {isSender ? (
                        <button
                            onClick={() => navigate(`/dating/saferide/${sessionId}`)}
                            className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg border border-gray-600 shadow-md flex items-center justify-center gap-2 transition-colors"
                        >
                            <span className="material-icons text-sm">visibility</span> Track Ride
                        </button>
                    ) : (
                        <button
                            onClick={() => navigate(`/dating/saferide/${sessionId}`)}
                            className="w-full py-2 bg-gradient-to-r from-gray-200 to-white hover:from-white hover:to-gray-100 text-black font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-colors"
                        >
                            <span className="material-icons text-sm">directions_car</span> Accept & Enter Pickup
                        </button>
                    )}
                </div>
            );
        }

        // 4. Plain Text
        return <p className="text-sm">{text}</p>;
    };



    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white relative">

            {/* Active Call Overlay */}
            {isInCall && (
                <VideoCall
                    matchId={matchId}
                    userId={user.id}
                    callType={activeCallType}
                    incomingSignal={incomingCall}
                    onEnd={() => {
                        setIsInCall(false);
                        setIncomingCall(null);
                    }}
                />
            )}

            {/* Emoji Editor Modal */}
            {showEmojiEditor && (
                <EmojiEditor
                    onClose={() => setShowEmojiEditor(false)}
                    onSave={handleEmojiSaved}
                />
            )}

            {/* Incoming Call Modal */}
            {incomingCall && !isInCall && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-gray-800 p-8 rounded-3xl text-center shadow-2xl border border-gray-700 max-w-sm w-full mx-4">
                        <div className="w-24 h-24 rounded-full bg-gray-700 mx-auto mb-4 overflow-hidden border-4 border-gray-600 animate-pulse">
                            {match?.photo ? (
                                <img src={match.photo} alt={match?.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-3xl font-bold bg-purple-900">{match?.name?.charAt(0)}</div>
                            )}
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-1">{match?.name || 'Match'}</h2>
                        <p className="text-gray-400 mb-8">Incoming {incomingCall.callType} call...</p>

                        <div className="flex justify-center gap-6">
                            <button
                                onClick={handleRejectCall}
                                className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 hover:scale-110 transition-all"
                            >
                                <span className="material-icons text-2xl">call_end</span>
                            </button>
                            <button
                                onClick={handleAcceptCall}
                                className="p-4 rounded-full bg-green-500 text-white hover:bg-green-600 hover:scale-110 transition-all animate-bounce"
                            >
                                <span className="material-icons text-2xl">call</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Feedback Modal */}
            <DateFeedback
                isOpen={showFeedback}
                onClose={() => setShowFeedback(false)}
                matchName={match?.name}
            />

            {/* Encrypted Header */}
            <div className="px-4 py-3 bg-gray-800 border-b border-purple-500/20 flex justify-between items-center shadow-lg z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/dating')} className="text-gray-400">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-purple-900 flex items-center justify-center border border-purple-500 overflow-hidden">
                            {match?.photo ? (
                                <img src={match.photo} alt={match?.name || 'User'} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm font-bold">{match?.name?.charAt(0) || 'U'}</span>
                            )}
                        </div>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></span>
                    </div>
                    <div>
                        <h3 className="font-bold flex items-center gap-1">
                            {match?.name || 'Unknown'}
                            {match?.isVerified && <span className="material-icons text-blue-400 text-[14px]">verified</span>}
                        </h3>
                        <div className="flex flex-col">
                            {participants.find(p => p.id === targetUserId)?.online && (
                                <p className="text-[11px] text-green-400 font-bold tracking-wide animate-pulse">
                                    • Online
                                </p>
                            )}
                            <p className="text-[10px] text-purple-400 uppercase tracking-wider flex items-center gap-1">
                                <span className="material-icons text-[10px]">lock</span> End-to-End Encrypted
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions & Guardian */}
                <div className="flex items-center gap-1 sm:gap-2">
                    {/* SafeRide / Uber Button */}
                    <button
                        onClick={() => {
                            toast.success("Select a destination to dispatch an Uber SafeRide!");
                            navigate(`/dating/plan-date/${targetUserId}`);
                        }}
                        className="p-2 rounded-full hover:bg-white/10 text-white/90 relative group"
                        title="Send Uber SafeRide"
                    >
                        <div className="absolute top-0 right-0 bg-black border border-gray-700 text-white text-[8px] font-bold px-1 py-[2px] rounded uppercase tracking-wider shadow-lg transform translate-x-2 -translate-y-1">Uber</div>
                        <span className="material-icons text-blue-400">local_taxi</span>
                    </button>

                    <button
                        onClick={() => handleStartCall('video')}
                        className="p-2 rounded-full hover:bg-white/10 text-white/90"
                        title="Video Call"
                    >
                        <span className="material-icons">videocam</span>
                    </button>
                    <button
                        onClick={() => handleStartCall('audio')}
                        className="p-2 rounded-full hover:bg-white/10 text-white/90"
                        title="Audio Call"
                    >
                        <span className="material-icons">call</span>
                    </button>
                    <button
                        onClick={() => navigate(`/dating/plan-date/${targetUserId}`)}
                        className="p-2 rounded-full hover:bg-white/10 text-white/90 hidden md:block"
                        title="Plan Safe Date"
                    >
                        <span className="material-icons">event</span>
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowChatMenu(!showChatMenu)}
                            className="p-2 rounded-full hover:bg-white/10 text-white/90"
                        >
                            <span className="material-icons">more_vert</span>
                        </button>
                        {showChatMenu && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowChatMenu(false)} />
                                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 w-52 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <button onClick={handleMuteChat} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                        <span className="material-icons text-lg">{isMuted ? 'notifications_active' : 'notifications_off'}</span>
                                        {isMuted ? 'Unmute Chat' : 'Mute Chat'}
                                    </button>
                                    <button onClick={handleSearchInChat} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                        <span className="material-icons text-lg">search</span> Search in Chat
                                    </button>
                                    <button onClick={handleViewProfile} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                        <span className="material-icons text-lg">person</span> View Profile
                                    </button>
                                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                    <button onClick={handleBlockUser} className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                                        <span className="material-icons text-lg">block</span>
                                        {isBlocked ? 'Unblock User' : 'Block User'}
                                    </button>
                                    <button onClick={handleReportUser} className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                                        <span className="material-icons text-lg">flag</span> Report User
                                    </button>
                                    <button onClick={handleClearChat} className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                                        <span className="material-icons text-lg">delete_sweep</span> Clear Chat
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Encrytion Notice */}
            <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 text-center text-xs text-yellow-800 dark:text-yellow-200 flex items-center justify-center gap-1">
                <span className="material-icons text-xs">lock</span> Messages are end-to-end encrypted.
            </div>

            {/* Search Bar */}
            {showSearchBar && (
                <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
                    <span className="material-icons text-gray-400">search</span>
                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search messages..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400"
                    />
                    {searchQuery && (
                        <span className="text-xs text-gray-400">
                            {filteredMessages.length} found
                        </span>
                    )}
                    <button
                        onClick={() => { setShowSearchBar(false); setSearchQuery(''); }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                    >
                        <span className="material-icons text-gray-400 text-sm">close</span>
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#e5ddd5] dark:bg-gray-900/50" ref={scrollRef}>
                {filteredMessages.map((msg, index) => {
                    const isMe = msg.sender_id === user?.id; // Identify if I sent it
                    return (
                        <div key={msg.id || index} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                            <div className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-sm relative ${isMe
                                ? 'bg-[#dcf8c6] dark:bg-primary text-gray-900 dark:text-white rounded-tr-none'
                                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-tl-none'
                                }`}>
                                {/* Sticker / Attachment / Text Rendering */}
                                {renderMessageContent(msg)}

                                <span className={`text-[10px] opacity-70 block text-right mt-1 flex items-center justify-end gap-1 ${isMe ? 'text-green-900 dark:text-gray-300' : 'text-gray-500'}`}>
                                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                    {isMe && <span className="material-icons text-[10px]">done_all</span>}
                                </span>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white dark:bg-gray-800 p-3 flex items-center gap-2 border-t border-gray-200 dark:border-gray-700 relative">

                {/* Uploads Menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        className={`p-2 rounded-full transition-colors ${showAttachMenu ? 'bg-gray-200 dark:bg-gray-700 rotate-45' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
                    >
                        <span className="material-icons transform transition-transform">add</span>
                    </button>
                    {showAttachMenu && (
                        <div className="absolute bottom-14 left-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-2 flex flex-col gap-2 min-w-[150px] animate-in slide-in-from-bottom-5 zoom-in-95 z-20">
                            <label className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors text-gray-700 dark:text-gray-200">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-full"><span className="material-icons text-sm">image</span></div>
                                <span className="text-sm font-medium">Photos & Videos</span>
                                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} /> {/* Simplification: treat both as 'image' type initially or detect? Let's use generic handler logic if possible, but hardcoding 'image' for now is safer until chatService is smarter */}
                            </label>
                            <label className="flex items-center gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors text-gray-700 dark:text-gray-200">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-full"><span className="material-icons text-sm">description</span></div>
                                <span className="text-sm font-medium">Document</span>
                                <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => handleFileUpload(e, 'document')} />
                            </label>
                        </div>
                    )}
                </div>

                <div className="relative">
                    <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-2 transition-colors ${showEmojiPicker ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'}`}
                    >
                        <span className="material-icons">emoji_emotions</span>
                    </button>

                    {showEmojiPicker && (
                        <div className="absolute bottom-14 left-0 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-3 z-20 w-72 animate-in slide-in-from-bottom-5 zoom-in-95">
                            <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
                                {['😀', '😂', '🥰', '😍', '😘', '🤗', '😎', '🤩',
                                    '😢', '😭', '😤', '🥺', '😏', '🤔', '🙄', '😴',
                                    '❤️', '🔥', '💯', '✨', '🎉', '👏', '🙏', '💪',
                                    '👍', '👎', '🤝', '✌️', '🤞', '👋', '💀', '🤡',
                                    '🥵', '🥶', '😈', '👀', '💋', '🌹', '🍷', '🎶',
                                    '💖', '💘', '💝', '💗', '❤️‍🔥', '🫶', '🤭', '😜'].map(emoji => (
                                        <button
                                            key={emoji}
                                            onClick={() => {
                                                setInput(prev => prev + emoji);
                                                setShowEmojiPicker(false);
                                            }}
                                            className="text-2xl p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-transform hover:scale-125 active:scale-90"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                            </div>
                            <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                                <button
                                    onClick={() => { setShowEmojiPicker(false); setShowEmojiEditor(true); }}
                                    className="text-xs text-purple-500 hover:text-purple-400 font-medium flex items-center gap-1"
                                >
                                    <span className="material-icons text-sm">brush</span>
                                    Create Custom Sticker
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message..."
                    className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-gray-900 dark:text-white"
                />

                {/* Mic / Send Button */}
                {input.trim() ? (
                    <button
                        onClick={handleSend}
                        className="p-2 bg-primary text-white rounded-full hover:bg-primary-dark transition-transform hover:scale-105 shadow-md"
                    >
                        <span className="material-icons">send</span>
                    </button>
                ) : (
                    <button
                        onClick={toggleRecording}
                        className={`p-2 rounded-full transition-all duration-200 shadow-md ${isRecording ? 'bg-red-500 text-white scale-125 animate-pulse' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 hover:bg-gray-300'}`}
                    >
                        <span className="material-icons">{isRecording ? 'stop' : 'mic_none'}</span>
                    </button>
                )}
            </div>

            {/* Report User Modal */}
            {showReportModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                <span className="material-icons text-red-500">flag</span>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Report User</h3>
                        </div>

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Report <strong>{match?.name || 'this user'}</strong> for inappropriate behavior. Our team will review the report.
                        </p>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason *</label>
                        <select
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4 focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                            <option value="">Select a reason</option>
                            <option value="harassment">Harassment / Bullying</option>
                            <option value="spam">Spam / Scam</option>
                            <option value="fake_profile">Fake Profile / Catfishing</option>
                            <option value="inappropriate_content">Inappropriate Content</option>
                            <option value="threats">Threats / Violence</option>
                            <option value="underage">Underage User</option>
                            <option value="other">Other</option>
                        </select>

                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
                        <textarea
                            value={reportDescription}
                            onChange={(e) => setReportDescription(e.target.value)}
                            placeholder="Describe what happened..."
                            rows={3}
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4 resize-none focus:ring-2 focus:ring-purple-500 outline-none"
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReportModal(false)}
                                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitReport}
                                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                            >
                                Submit Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
