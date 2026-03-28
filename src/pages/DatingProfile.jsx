import React, { useState, useEffect, useRef } from 'react';
import { useDating } from '../context/DatingContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { uploadProfileMedia } from '../services/storageService';

export default function DatingProfile() {
    const { user } = useAuth();
    const { datingProfile, createDatingProfile } = useDating();
    const toast = useToast();
    const navigate = useNavigate();

    const [bio, setBio] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [photos, setPhotos] = useState([]);
    const [interests, setInterests] = useState([]);
    const [locationLabel, setLocationLabel] = useState('');
    const [coords, setCoords] = useState({ lat: null, lng: null });
    const [isLocating, setIsLocating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const INTEREST_OPTIONS = [
        'Hiking', 'Music', 'Gaming', 'Cooking', 'Travel', 'Fitness',
        'Art', 'Movies', 'Reading', 'Dancing', 'Photography', 'Yoga',
        'Coffee', 'Wine', 'Dogs', 'Cats', 'Outdoors', 'Fashion',
        'Tech', 'Foodie', 'Sports', 'Meditation', 'DIY', 'Volunteering',
    ];

    useEffect(() => {
        if (datingProfile) {
            setBio(datingProfile.bio || '');
            setAge(datingProfile.age || '');
            setGender(datingProfile.gender || '');
            setPhotos(datingProfile.photos || []);
            setInterests(datingProfile.interests || []);
            if (datingProfile.location) setLocationLabel(datingProfile.location);
            if (datingProfile.lat && datingProfile.lng) {
                setCoords({ lat: datingProfile.lat, lng: datingProfile.lng });
            }
        }
    }, [datingProfile]);

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation not supported by your browser');
            return;
        }
        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                setCoords({ lat: latitude, lng: longitude });
                // Reverse geocode for a human-readable label
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
                    );
                    const data = await res.json();
                    const city = data.address?.city || data.address?.town || data.address?.village || '';
                    const state = data.address?.state || '';
                    const country = data.address?.country_code?.toUpperCase() || '';
                    setLocationLabel([city, state, country].filter(Boolean).join(', '));
                } catch {
                    setLocationLabel(`${latitude.toFixed(3)}, ${longitude.toFixed(3)}`);
                }
                toast.success('Location saved!');
                setIsLocating(false);
            },
            (err) => {
                console.error(err);
                toast.error('Could not get location. Check browser permissions.');
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const toggleInterest = (interest) => {
        setInterests(prev =>
            prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
        );
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!bio || !age) {
            toast.error("Please fill in all fields");
            return;
        }

        setIsSaving(true);
        try {
            await createDatingProfile({
                bio,
                age: Math.min(120, Math.max(18, parseInt(age) || 18)),
                gender: gender || null,
                photos: photos.length > 0 ? photos : ['https://placehold.co/400x600?text=No+Photo'],
                interests,
                location: locationLabel || null,
                lat: coords.lat,
                lng: coords.lng,
            });
            toast.success("Dating Profile Updated!");
            navigate('/dating');
        } catch (error) {
            console.error(error);
            toast.error("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddPhoto = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }
        setIsUploading(true);
        try {
            const url = await uploadProfileMedia(file, user.id, 'photos');
            setPhotos(prev => [...prev, url]);
            toast.success('Photo uploaded!');
        } catch (err) {
            console.error(err);
            toast.error('Failed to upload photo');
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 pb-24">
            <header className="flex justify-between items-center mb-8 pt-4">
                <button onClick={() => navigate(-1)} className="text-gray-400">
                    <span className="material-icons">arrow_back</span>
                </button>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Edit Dating Profile
                </h1>
                <div className="w-8"></div>
            </header>

            <form onSubmit={handleSave} className="space-y-6 max-w-md mx-auto">

                {/* Safety Score Card */}
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-200">Safety Score</h3>
                            <p className="text-xs text-gray-400">Calculated from verification & history</p>
                        </div>
                        <div className="bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/20">
                            Verified
                        </div>
                    </div>

                    <div className="relative h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 transition-all duration-1000"
                            style={{ width: `${user.isVerified ? 100 : 50}%` }}
                        ></div>
                    </div>
                    <div className="mt-2 text-right text-2xl font-bold text-white">
                        {user.isVerified ? '100' : '50'}/100
                    </div>
                </div>

                {/* Photos */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Photos</label>
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileSelected}
                        />
                        {photos.map((url, idx) => (
                            <div key={idx} className="aspect-[3/4] rounded-lg overflow-hidden relative group">
                                <img src={url} alt="Profile" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                                    className="absolute top-1 right-1 bg-black/50 rounded-full p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <span className="material-icons text-xs">close</span>
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleAddPhoto}
                            disabled={isUploading}
                            className="aspect-[3/4] rounded-lg border-2 border-dashed border-gray-700 flex flex-col items-center justify-center text-gray-500 hover:border-purple-500 hover:text-purple-500 transition-colors disabled:opacity-50"
                        >
                            <span className="material-icons text-2xl">{isUploading ? 'hourglass_empty' : 'add_a_photo'}</span>
                            <span className="text-xs mt-1">{isUploading ? 'Uploading...' : 'Add'}</span>
                        </button>
                    </div>
                </div>

                {/* Bio & Details */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Age</label>
                        <input
                            type="number"
                            value={age}
                            onChange={(e) => setAge(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="25"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Gender</label>
                        <select
                            value={gender}
                            onChange={(e) => setGender(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                        >
                            <option value="">Prefer not to say</option>
                            <option value="man">Man</option>
                            <option value="woman">Woman</option>
                            <option value="nonbinary">Non-binary</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">About Me</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            rows="4"
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                            placeholder="I investigate red flags for fun..."
                        />
                    </div>

                    {/* Location */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                        <button
                            type="button"
                            onClick={handleGetLocation}
                            disabled={isLocating}
                            className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-left hover:border-purple-500 transition-colors disabled:opacity-50"
                        >
                            <span className="flex items-center gap-2 text-sm">
                                <span className="material-icons text-purple-400 text-base">location_on</span>
                                <span className={locationLabel ? 'text-white' : 'text-gray-500'}>
                                    {isLocating ? 'Getting location...' : locationLabel || 'Tap to use my location'}
                                </span>
                            </span>
                            <span className="material-icons text-gray-500 text-base">
                                {isLocating ? 'sync' : 'my_location'}
                            </span>
                        </button>
                        {coords.lat && (
                            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                                <span className="material-icons text-xs">check_circle</span>
                                GPS coordinates saved — you'll appear in local search
                            </p>
                        )}
                    </div>

                    {/* Interests */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            Interests
                            <span className="text-gray-600 font-normal ml-1">({interests.length} selected)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {INTEREST_OPTIONS.map(interest => (
                                <button
                                    key={interest}
                                    type="button"
                                    onClick={() => toggleInterest(interest)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                        interests.includes(interest)
                                            ? 'bg-purple-600 border-purple-500 text-white'
                                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                                    }`}
                                >
                                    {interest}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-purple-900/30 active:scale-95 transition-transform disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Profile & Go Dating'}
                </button>

            </form>
        </div>
    );
}
