
import React, { useState, useEffect } from 'react';
import { emojiService } from '../services/emojiService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function EmojiEditor({ onClose, onSave }) {
    const { user } = useAuth();
    const toast = useToast();

    // Editor State
    const [config, setConfig] = useState({
        shape: 'squircle',
        color: '#fbbf24', // Default Yellow
        eyes: 'normal',
        mouth: 'smile',
        accessory: 'none'
    });

    const [name, setName] = useState('');
    const [previewSVG, setPreviewSVG] = useState('');
    const [activeTab, setActiveTab] = useState('library'); // base, eyes, mouth, accessory

    // Library State
    const [libraryResults, setLibraryResults] = useState([]);

    // Initial Load for Library
    useEffect(() => {
        emojiService.getTrendingEmojis().then(setLibraryResults);
    }, []);

    // Update preview on config change
    useEffect(() => {
        setPreviewSVG(emojiService.generateSVG(config));
    }, [config]);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Please name your emoji!");
            return;
        }

        try {
            const savedEmoji = await emojiService.saveEmoji(user.id, name, config);
            toast.success("Emoji saved!");
            if (onSave) onSave(savedEmoji);
            onClose();
        } catch (error) {
            console.error("Save error:", error);
            // Mock save for demo/fallback if DB fails:
            const mockEmoji = { id: Date.now(), name, config, svg: emojiService.generateSVG(config) };
            if (onSave) onSave(mockEmoji);
            onClose();
        }
    };

    const Colors = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa', '#f472b6', '#ffffff', '#9ca3af'];

    return (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-gray-900/90 w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh] ring-1 ring-white/20">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-800 bg-black/20 flex justify-between items-center">
                    <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Studio Emoji 🎨</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <span className="material-icons">close</span>
                    </button>
                </div>

                {/* Preview Area (Showcase) */}
                <div className="flex-shrink-0 relative bg-gradient-to-b from-purple-900/20 to-gray-900 p-8 flex flex-col items-center justify-center">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

                    <div className="relative group perspective-1000">
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-600 to-pink-600 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 animate-pulse"></div>
                        <div
                            className="w-40 h-40 drop-shadow-2xl filter transform transition-all duration-300 hover:scale-110 hover:rotate-3 cursor-pointer z-10 relative"
                            dangerouslySetInnerHTML={{ __html: previewSVG }}
                        />
                    </div>

                    <div className="mt-6 w-full max-w-xs relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Emoji Name..."
                            className="relative w-full text-center bg-gray-900/80 border border-gray-700 focus:border-purple-500 rounded-xl outline-none py-3 px-4 text-white placeholder-gray-500 font-bold tracking-wide transition-all focus:ring-2 focus:ring-purple-500/50"
                        />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex bg-black/30 p-1 mx-4 mt-2 rounded-xl backdrop-blur-sm overflow-x-auto">
                    {['library', 'base', 'eyes', 'mouth', 'accessory'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 min-w-[70px] py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${activeTab === tab
                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/50'
                                : 'text-gray-500 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Controls - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">

                    {/* Library Tab (New) */}
                    {activeTab === 'library' && (
                        <div className="animate-in slide-in-from-bottom-4 duration-300 space-y-4">
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 material-icons">search</span>
                                <input
                                    type="text"
                                    placeholder="Search 100k+ Emojis..."
                                    className="w-full bg-gray-800/50 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-purple-500 outline-none transition-all"
                                    onChange={(e) => {
                                        const q = e.target.value;
                                        if (q.length > 2) {
                                            emojiService.searchExternalEmojis(q).then(setLibraryResults);
                                        } else if (q.length === 0) {
                                            emojiService.getTrendingEmojis().then(setLibraryResults);
                                        }
                                    }}
                                />
                            </div>

                            <div className="grid grid-cols-4 gap-3">
                                {libraryResults.map((emoji) => (
                                    <button
                                        key={emoji.hex}
                                        onClick={() => {
                                            // Provide option to EDIT or SEND directly?
                                            // For now, let's just SEND directly by closing and passing
                                            // OR load it as a "Shape" if we could (complex).
                                            // Let's treat it as "Selecting a sticker"
                                            if (onSave) onSave({
                                                id: emoji.hex,
                                                name: emoji.name,
                                                svg: `<image href="${emoji.url}" width="100" height="100" />`, // SVG wrap
                                                isExternal: true
                                            });
                                            onClose();
                                        }}
                                        className="aspect-square bg-gray-800/40 rounded-xl p-2 hover:bg-white/10 hover:scale-110 transition-all cursor-pointer flex items-center justify-center border border-white/5"
                                        title={emoji.name}
                                    >
                                        <img src={emoji.url} alt={emoji.name} className="w-full h-full object-contain drop-shadow-md loading='lazy'" />
                                    </button>
                                ))}
                                {libraryResults.length === 0 && (
                                    <div className="col-span-4 text-center text-gray-500 py-10">
                                        <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                                        Loading Library...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Base Tab: Shape & Color */}
                    {activeTab === 'base' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-3">
                                    <span className="material-icons text-sm">shapes</span> Shape
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {emojiService.assets.shapes.map(shape => (
                                        <button
                                            key={shape}
                                            onClick={() => setConfig({ ...config, shape })}
                                            className={`h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${config.shape === shape
                                                ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20 scale-105'
                                                : 'border-gray-800 bg-gray-800/50 hover:bg-gray-800 hover:border-gray-600'
                                                }`}
                                        >
                                            <span className="text-xs capitalize font-bold text-gray-300">{shape}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-3">
                                    <span className="material-icons text-sm">palette</span> Color
                                </label>
                                <div className="flex flex-wrap gap-4">
                                    {Colors.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setConfig({ ...config, color: c })}
                                            className={`w-12 h-12 rounded-full border-4 shadow-xl transform transition-transform duration-200 ${config.color === c ? 'border-purple-500 scale-110 ring-2 ring-purple-500/50' : 'border-gray-800 hover:scale-105'
                                                }`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Eyes Tab */}
                    {activeTab === 'eyes' && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                            {emojiService.assets.eyes.map(eye => (
                                <button
                                    key={eye}
                                    onClick={() => setConfig({ ...config, eyes: eye })}
                                    className={`relative p-2 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 overflow-hidden ${config.eyes === eye
                                        ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20'
                                        : 'border-gray-800 bg-gray-800/50 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="scale-75 transform">
                                        <svg viewBox="0 0 100 80" className="w-full h-full">
                                            <circle cx="50" cy="40" r="30" fill="#2d2d2d" />
                                            <g dangerouslySetInnerHTML={{
                                                __html:
                                                    emojiService.generateSVG({ shape: 'circle', color: '#2d2d2d', eyes: eye, mouth: 'none', accessory: 'none' })
                                            }} />
                                        </svg>
                                    </div>
                                    {config.eyes === eye && <div className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Mouth Tab */}
                    {activeTab === 'mouth' && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                            {emojiService.assets.mouths.map(mouth => (
                                <button
                                    key={mouth}
                                    onClick={() => setConfig({ ...config, mouth: mouth })}
                                    className={`relative p-2 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 overflow-hidden ${config.mouth === mouth
                                        ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20'
                                        : 'border-gray-800 bg-gray-800/50 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="scale-75 transform">
                                        <svg viewBox="0 0 100 100" className="w-16 h-16">
                                            <circle cx="50" cy="50" r="40" fill="#2d2d2d" />
                                            <g dangerouslySetInnerHTML={{
                                                __html:
                                                    emojiService.generateSVG({ shape: 'circle', color: '#2d2d2d', eyes: 'none', mouth: mouth, accessory: 'none' })
                                            }} />
                                        </svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Accessory Tab */}
                    {activeTab === 'accessory' && (
                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                            {emojiService.assets.accessories.map(acc => (
                                <button
                                    key={acc}
                                    onClick={() => setConfig({ ...config, accessory: acc })}
                                    className={`relative p-2 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 overflow-hidden ${config.accessory === acc
                                        ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20'
                                        : 'border-gray-800 bg-gray-800/50 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="flex flex-col items-center">
                                        <span className="text-[10px] uppercase font-bold text-gray-400 mb-1">{acc}</span>
                                        <svg viewBox="0 0 100 100" className="w-10 h-10">
                                            <circle cx="50" cy="50" r="40" fill="#2d2d2d" />
                                            <g dangerouslySetInnerHTML={{
                                                __html:
                                                    emojiService.generateSVG({ shape: 'circle', color: '#2d2d2d', eyes: 'normal', mouth: 'smile', accessory: acc })
                                            }} />
                                        </svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 bg-black/20 backdrop-blur-sm">
                    <button
                        onClick={handleSave}
                        className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black uppercase tracking-widest shadow-xl shadow-purple-900/40 hover:shadow-purple-900/60 active:scale-95 transition-all duration-200 group overflow-hidden relative"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <span className="relative z-10 flex items-center justify-center gap-2">
                            Save Masterpiece <span className="material-icons animate-bounce">save</span>
                        </span>
                    </button>
                </div>

            </div>
        </div>
    );
}
