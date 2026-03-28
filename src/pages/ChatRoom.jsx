import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { subscribeToAnonMessages, sendAnonMessage, generateNickname } from '../services/chatService';
import { uploadChatMedia } from '../services/storageService';


export default function ChatRoom() {
    const { room } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const toast = useToast();
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [myId] = useState(() => {
        const storedId = localStorage.getItem(`chat_id_${room}`);
        if (storedId) {
            try {
                return JSON.parse(storedId);
            } catch {
                localStorage.removeItem(`chat_id_${room}`);
            }
        }
        const newId = generateNickname();
        localStorage.setItem(`chat_id_${room}`, JSON.stringify(newId));
        return newId;
    });
    const [genderVerified, setGenderVerified] = useState(false);
    const messagesEndRef = useRef(null);

    // Voice recording
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const recordingTimerRef = useRef(null);

    // Verify gender on room access
    useEffect(() => {
        if (!user) return;
        const dbGender = user.gender?.toLowerCase();
        const allowed =
            (room === 'women' && dbGender === 'female') ||
            (room === 'men' && dbGender === 'male');
        if (!allowed) navigate('/chat');
        else setGenderVerified(true);
    }, [user, room, navigate]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 80);
    };

    useEffect(() => {
        const unsubscribe = subscribeToAnonMessages(room, (newMessages) => {
            setMessages(newMessages);
            scrollToBottom();
        });
        return () => unsubscribe();
    }, [room]);

    // File attachment state
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreview, setFilePreview] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const fileInputRef = useRef(null);

    // Revoke blob URLs to prevent memory leaks
    useEffect(() => {
        return () => {
            if (filePreview) URL.revokeObjectURL(filePreview);
        };
    }, [filePreview]);

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        // Revoke previous preview before creating a new one
        if (filePreview) URL.revokeObjectURL(filePreview);
        setSelectedFile(file);
        if (file.type.startsWith('image/')) {
            setFileType('image');
            setFilePreview(URL.createObjectURL(file));
        } else if (file.type.startsWith('video/')) {
            setFileType('video');
            setFilePreview(URL.createObjectURL(file));
        } else {
            setFileType('document');
            setFilePreview(null);
        }
    };

    // Optimistic message helper
    const addOptimistic = (overrides) => {
        const msg = {
            id: `temp_${Date.now()}`,
            text: '',
            nickname: myId.name,
            avatar: myId.emoji,
            type: 'text',
            timestamp: new Date().toISOString(),
            isOptimistic: true,
            ...overrides,
        };
        setMessages(prev => [...prev, msg]);
        scrollToBottom();
        return msg.id;
    };

    const removeOptimistic = (tempId) => {
        setMessages(prev => prev.filter(m => m.id !== tempId));
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if ((!inputText.trim() && !selectedFile) || !genderVerified) return;

        const text = inputText;
        setInputText('');

        // Text-only: just send, no need to block UI
        if (!selectedFile) {
            try {
                await sendAnonMessage(room, text, myId.name, myId.emoji, null, 'text');
            } catch {
                toast.error('No se pudo enviar. Intenta de nuevo.');
            }
            return;
        }

        // File: show optimistic message immediately, upload in background
        const localPreview = filePreview;
        const localType = fileType;
        const file = selectedFile;
        setSelectedFile(null);
        setFilePreview(null);
        setFileType(null);
        setIsSending(true);

        const tempId = addOptimistic({
            text: text || null,
            attachment: localPreview ? { url: localPreview, type: localType } : null,
            type: localType,
        });

        try {
            const url = await uploadChatMedia(file, room);
            const attachment = { url, type: localType, name: 'File-' + Math.floor(Math.random() * 10000) };
            await sendAnonMessage(room, text, myId.name, myId.emoji, attachment, localType);
        } catch (err) {
            console.error('Send failed:', err);
            toast.error('Error al enviar. Intenta de nuevo.');
        } finally {
            removeOptimistic(tempId);
            setIsSending(false);
        }
    };

    // Voice recording toggle
    const toggleRecording = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            clearInterval(recordingTimerRef.current);
            setRecordingSeconds(0);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });

                const tempId = addOptimistic({ text: '🎤 Enviando nota de voz...', type: 'audio' });

                try {
                    const url = await uploadChatMedia(audioFile, room);
                    await sendAnonMessage(room, '', myId.name, myId.emoji, { url, type: 'audio' }, 'audio');
                } catch {
                    toast.error('Error al enviar nota de voz.');
                } finally {
                    removeOptimistic(tempId);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingSeconds(0);
            recordingTimerRef.current = setInterval(() => {
                setRecordingSeconds(s => s + 1);
            }, 1000);
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                toast.error('Permiso de micrófono denegado.');
            } else {
                toast.error('No se pudo acceder al micrófono.');
            }
        }
    };

    // Cleanup recording timer on unmount
    useEffect(() => () => clearInterval(recordingTimerRef.current), []);

    const isRoomWomen = room === 'women';
    const roomColor = isRoomWomen ? 'from-pink-500 to-primary' : 'from-blue-600 to-blue-400';
    const roomTitle = isRoomWomen ? "Women's Room" : "Men's Room";

    const formatSeconds = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

    const renderAttachment = (msg) => {
        const att = msg.attachment || (msg.imageUrl ? { url: msg.imageUrl, type: 'image' } : null);
        if (!att) return null;

        if (att.type === 'image') {
            return (
                <img
                    src={att.url}
                    alt="Imagen"
                    className="rounded-lg mb-2 max-h-48 w-auto object-cover border border-white/20"
                />
            );
        }
        if (att.type === 'video') {
            return (
                <video
                    src={att.url}
                    controls
                    className="rounded-lg mb-2 max-h-48 w-full border border-white/20 bg-black/50"
                />
            );
        }
        if (att.type === 'audio') {
            return (
                <audio
                    src={att.url}
                    controls
                    className="w-full mb-2 rounded-lg"
                    style={{ minWidth: 200 }}
                />
            );
        }
        return (
            <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 mb-2 rounded-lg bg-black/10 dark:bg-white/10 border border-white/10 hover:bg-black/20 transition-colors"
                download={att.name || 'download'}
            >
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="material-icons text-xl">description</span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{att.name || 'Documento'}</p>
                    <p className="text-[10px] opacity-70 uppercase tracking-wider">Descargar</p>
                </div>
                <span className="material-icons text-sm opacity-50">download</span>
            </a>
        );
    };

    return (
        <div className="bg-background-light dark:bg-background-dark min-h-screen font-display text-gray-900 dark:text-gray-100 flex flex-col antialiased h-screen overflow-hidden">
            {/* Header */}
            <header className="p-4 pt-10 flex items-center justify-between border-b border-gray-100 dark:border-white/5 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/chat')} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-lg font-bold">{roomTitle}</h1>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-semibold">Live Anon Chat</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                    <span className="text-lg">{myId.emoji}</span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{myId.name}</span>
                </div>
            </header>

            {/* Messages Area */}
            <main className="flex-1 overflow-y-auto p-4 space-y-4 pt-6 scroll-smooth hide-scrollbar bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-50 via-white to-gray-50 dark:from-[#0f0c15] dark:via-[#1a1525] dark:to-[#0f0c15]">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-40 px-12 text-center animate-fade-in">
                        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${roomColor} flex items-center justify-center mb-6 opacity-80`}>
                            <span className="material-icons text-4xl text-white">forum</span>
                        </div>
                        <h3 className="text-lg font-bold mb-1">Sin mensajes aún</h3>
                        <p className="text-sm">¡Sé el primero en escribir!</p>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    const isMe = msg.nickname === myId.name;
                    const showAvatar = idx === 0 || messages[idx - 1].nickname !== msg.nickname;

                    return (
                        <div
                            key={msg.id || idx}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${msg.isOptimistic ? 'opacity-60' : 'animate-slide-up'}`}
                        >
                            {!isMe && showAvatar && (
                                <div className="flex items-end gap-2 mb-1 px-1">
                                    <span className="text-lg filter drop-shadow-sm">{msg.avatar}</span>
                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{msg.nickname}</span>
                                </div>
                            )}

                            <div className={`
                                max-w-[85%] px-5 py-3 rounded-2xl text-sm shadow-sm relative group transition-all duration-200
                                ${isMe
                                    ? `bg-gradient-to-br ${roomColor} text-white rounded-tr-sm hover:brightness-110`
                                    : 'bg-white dark:bg-[#252033] text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-100 dark:border-white/5'
                                }
                            `}>
                                {renderAttachment(msg)}
                                {msg.text && <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                                <span className={`text-[9px] block text-right mt-1 opacity-70 font-medium ${isMe ? 'text-white/80' : 'text-gray-400'}`}>
                                    {msg.isOptimistic ? '⏳' : msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            </div>
                        </div>
                    );
                })}

                <div ref={messagesEndRef} className="h-4" />
            </main>

            {/* Input Area */}
            <footer className="p-4 pb-10 bg-background-light dark:bg-background-dark border-t border-gray-100 dark:border-white/5">
                {/* Recording indicator */}
                {isRecording && (
                    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-semibold text-red-500">Grabando {formatSeconds(recordingSeconds)}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">Toca el mic para enviar</span>
                    </div>
                )}

                {/* File preview */}
                {selectedFile && (
                    <div className="px-1 mb-2 flex items-center gap-2">
                        <div className="relative">
                            {filePreview ? (
                                fileType === 'video'
                                    ? <video src={filePreview} className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                                    : <img src={filePreview} alt="Seleccionado" className="h-16 w-16 rounded-lg object-cover border border-gray-200" />
                            ) : (
                                <div className="h-16 w-16 rounded-lg border border-gray-200 flex items-center justify-center bg-gray-100 dark:bg-white/5">
                                    <span className="material-icons text-gray-400">description</span>
                                </div>
                            )}
                            <button
                                onClick={() => { setFilePreview(null); setSelectedFile(null); setFileType(null); }}
                                className="absolute -top-1 -right-1 bg-gray-800 text-white rounded-full p-0.5 shadow"
                            >
                                <span className="material-icons text-[10px]">close</span>
                            </button>
                        </div>
                        <div className="text-xs text-gray-500">
                            <p className="font-bold">{fileType?.toUpperCase()}</p>
                            <p className="max-w-[180px] truncate">{selectedFile.name}</p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleSend} className="flex items-center gap-2">
                    {/* Attach */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-primary transition-colors active:scale-95"
                    >
                        <span className="material-icons">attach_file</span>
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,video/*,application/pdf"
                        onChange={handleFileSelect}
                    />

                    {/* Text input */}
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder={isRecording ? 'Grabando...' : 'Escribe un mensaje...'}
                        className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all dark:text-white"
                        disabled={isSending || isRecording}
                    />

                    {/* Mic button */}
                    <button
                        type="button"
                        onClick={toggleRecording}
                        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ${isRecording
                                ? 'bg-red-500 text-white scale-110 animate-pulse shadow-lg shadow-red-500/40'
                                : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-primary'
                            }`}
                    >
                        <span className="material-icons text-xl">{isRecording ? 'stop' : 'mic'}</span>
                    </button>

                    {/* Send button */}
                    <button
                        type="submit"
                        disabled={(!inputText.trim() && !selectedFile) || isSending || isRecording}
                        className={`w-11 h-11 rounded-full bg-gradient-to-br ${roomColor} text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 disabled:opacity-40`}
                    >
                        {isSending ? (
                            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span className="material-icons text-xl">send</span>
                        )}
                    </button>
                </form>

                <p className="text-[9px] text-center text-gray-400 dark:text-gray-500 mt-3 flex items-center justify-center gap-1">
                    <span className="material-icons text-[10px]">timer</span>
                    Mensajes y archivos desaparecen en 24h
                </p>
            </footer>
        </div>
    );
}
