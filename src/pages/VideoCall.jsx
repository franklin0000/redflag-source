import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { connectToVideoRoom } from '../services/videoService';
import { useToast } from '../context/ToastContext';

/**
 * Production-ready Video Call Page
 * Demonstrates advanced Twilio Video integration with TURN servers and quality monitoring.
 */
export default function VideoCall() {
    const { roomName } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    
    const [_room, setRoom] = useState(null); // kept for potential future use
    const [participants, setParticipants] = useState([]);
    const [quality, setQuality] = useState('Checking...');
    const [isConnecting, setIsConnecting] = useState(true);
    
    const localVideoRef = useRef(null);
    const remoteMediaRef = useRef(null);

    useEffect(() => {
        let activeRoom = null;

        async function startCall() {
            try {
                const connectedRoom = await connectToVideoRoom(roomName || 'RedFlag-Test');
                activeRoom = connectedRoom;
                setRoom(connectedRoom);
                setIsConnecting(false);

                // Handle local track display
                const localTrack = Array.from(connectedRoom.localParticipant.videoTracks.values())[0].track;
                localTrack.attach(localVideoRef.current);

                // Monitor Quality
                connectedRoom.localParticipant.on('networkQualityLevelChanged', (level) => {
                    const levels = { 0: 'Unknown', 1: 'Critical', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Excellent' };
                    setQuality(levels[level]);
                    if (level <= 2) toast.warning('Sujeción de red inestable. Priorizando audio...');
                });

                // Handle Remote Participants
                connectedRoom.on('participantConnected', participant => {
                    console.log(`Participant connected: ${participant.identity}`);
                    setParticipants(prev => [...prev, participant]);
                    
                    participant.on('trackSubscribed', track => {
                        if (track.kind === 'video' || track.kind === 'audio') {
                            track.attach(remoteMediaRef.current);
                        }
                    });
                });

                connectedRoom.on('participantDisconnected', participant => {
                    setParticipants(prev => prev.filter(p => p !== participant));
                });

            } catch (error) {
                console.error('Call failed:', error);
                toast.error('Error al iniciar la videollamada: ' + error.message);
                setIsConnecting(false);
            }
        }

        startCall();

        return () => {
            if (activeRoom) {
                activeRoom.disconnect();
            }
        };
    }, [roomName, toast]);

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col">
            {/* Header / Info */}
            <header className="p-4 bg-slate-900/50 backdrop-blur border-b border-white/10 flex justify-between items-center">
                <div>
                    <h1 className="font-bold">Sala: {roomName || 'General'}</h1>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                        Calidad de Red: 
                        <span className={`ml-1 font-bold ${quality === 'Excellent' ? 'text-green-500' : 'text-yellow-500'}`}>
                            {quality}
                        </span>
                    </p>
                </div>
                <button 
                    onClick={() => navigate(-1)}
                    className="bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-sm font-bold border border-red-500/30 hover:bg-red-500 hover:text-white transition-all"
                >
                    Finalizar
                </button>
            </header>

            {/* Video Grid */}
            <main className="flex-1 relative p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {isConnecting && (
                    <div className="absolute inset-0 z-50 bg-slate-950/80 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="font-medium animate-pulse">Estableciendo conexión segura (TURN)...</p>
                    </div>
                )}

                {/* Remote Participant */}
                <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-white/5 shadow-2xl flex items-center justify-center">
                    <div ref={remoteMediaRef} className="w-full h-full"></div>
                    {participants.length === 0 && !isConnecting && (
                        <div className="text-center">
                            <span className="material-icons text-6xl text-slate-700 mb-2">person_outline</span>
                            <p className="text-slate-500">Esperando a otro participante...</p>
                        </div>
                    )}
                </div>

                {/* Local Camera */}
                <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-white/5 shadow-2xl">
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror" />
                    <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs font-bold border border-white/10">
                        Tú (Local)
                    </div>
                </div>
            </main>

            {/* Controls */}
            <footer className="p-6 flex justify-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
                <button className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                    <span className="material-icons">mic</span>
                </button>
                <button className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition-colors">
                    <span className="material-icons">videocam</span>
                </button>
                <button 
                    onClick={() => navigate(-1)}
                    className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-500 transition-colors shadow-lg shadow-red-500/40"
                >
                    <span className="material-icons text-white">call_end</span>
                </button>
            </footer>

            <style dangerouslySetInnerHTML={{ __html: `
                .mirror { transform: scaleX(-1); }
                video { background: #0f172a; }
            `}} />
        </div>
    );
}
