import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDating } from '../context/DatingContext';

export default function DatingMatches() {
    const { matches, loading } = useDating();
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-900 text-white pb-20">
            {/* Header */}
            <header className="p-4 flex items-center gap-4 bg-black/40 backdrop-blur-md sticky top-0 z-10 border-b border-gray-800">
                <button
                    onClick={() => navigate('/dating')}
                    className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white"
                >
                    <span className="material-icons">arrow_back</span>
                </button>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Matches & Chats
                </h1>
            </header>

            {/* Matches List */}
            <div className="p-4 space-y-4">
                {/* New Matches Row (Horizontal Scroll) */}
                <section>
                    <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">New Matches</h2>
                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                        {matches.length === 0 && !loading && (
                            <div className="text-gray-500 text-sm whitespace-nowrap">No matches yet. Keep swiping!</div>
                        )}

                        {matches.map(match => (
                            <div
                                key={match.match_id || match.id}
                                onClick={() => navigate(`/dating/chat/${match.id}`)}
                                className="flex flex-col items-center gap-2 cursor-pointer min-w-[80px]"
                            >
                                <div className="relative w-16 h-16">
                                    <div className={`w-full h-full rounded-full overflow-hidden border-2 p-0.5 ${match.unread > 0 ? 'border-pink-500' : 'border-purple-500/50'}`}>
                                        {match.photo ? (
                                            <img src={match.photo} alt={match.name} className="w-full h-full rounded-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full rounded-full bg-purple-900 flex items-center justify-center text-xl font-bold">
                                                {match.name?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    {match.unread > 0 && (
                                        <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full border-2 border-gray-900 flex items-center justify-center px-1">
                                            <span className="text-[10px] font-bold text-white">{match.unread > 9 ? '9+' : match.unread}</span>
                                        </div>
                                    )}
                                </div>
                                <span className="text-xs font-bold truncate w-full text-center">{match.name}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Messages List */}
                <section>
                    <h2 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Messages</h2>
                    <div className="space-y-2">
                        {matches.length === 0 && !loading && (
                            <div className="text-gray-500 text-sm text-center py-8">
                                <span className="material-icons text-4xl text-gray-700 mb-2">chat_bubble_outline</span>
                                <p>No conversations yet</p>
                            </div>
                        )}

                        {matches.map(match => (
                            <div
                                key={match.match_id || match.id}
                                onClick={() => navigate(`/dating/chat/${match.id}`)}
                                className={`flex items-center gap-4 p-3 rounded-xl transition-colors cursor-pointer ${match.unread > 0 ? 'bg-gray-800 border border-purple-500/20' : 'bg-gray-800/50 hover:bg-gray-800'}`}
                            >
                                <div className="relative w-14 h-14 shrink-0">
                                    {match.photo ? (
                                        <img src={match.photo} alt={match.name} className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full rounded-full bg-purple-900 flex items-center justify-center text-xl font-bold text-white">
                                            {match.name?.charAt(0)}
                                        </div>
                                    )}
                                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-gray-900"></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-0.5">
                                        <h3 className={`truncate ${match.unread > 0 ? 'font-bold text-white' : 'font-semibold text-gray-200'}`}>
                                            {match.name}
                                        </h3>
                                        <span className="text-xs text-gray-500 shrink-0 ml-2">
                                            {match.timestamp ? new Date(match.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className={`text-sm truncate ${match.unread > 0 ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>
                                            {match.lastMessage || "Start the conversation! 👋"}
                                        </p>
                                        {match.unread > 0 && (
                                            <span className="shrink-0 min-w-[20px] h-5 bg-purple-600 rounded-full text-[11px] font-bold text-white flex items-center justify-center px-1.5">
                                                {match.unread > 9 ? '9+' : match.unread}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
