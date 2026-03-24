import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchMatchProfile(userId) {
  const token = localStorage.getItem('rf_token');
  const res = await fetch(`${API_BASE}/api/dating/profile/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Not found');
  return data;
}

export default function MatchProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Use name/photo passed via navigation state for instant display while loading
  const hint = location.state || {};

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    fetchMatchProfile(userId)
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-3">
      {hint.photo
        ? <img src={hint.photo} alt={hint.name} className="w-20 h-20 rounded-full object-cover border-2 border-gray-600" />
        : <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-3xl font-bold">{hint.name?.[0] || '?'}</div>
      }
      {hint.name && <p className="font-bold text-lg">{hint.name}</p>}
      <div className="w-6 h-6 border-4 border-gray-600 border-t-white rounded-full animate-spin mt-2" />
    </div>
  );

  if (!profile) return (
    <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="material-icons text-5xl text-gray-600">person_off</span>
      <p className="text-gray-400">Profile not available.</p>
      <button onClick={() => navigate(-1)} className="text-blue-400 underline text-sm">Go back</button>
    </div>
  );

  const photos = profile.photos?.length ? profile.photos
    : profile.photo_url ? [profile.photo_url] : [];

  const safetyScore = profile.safety_score ?? 50;
  const redFlagCount = profile.reportCount || 0;

  // Safety tier
  const tier = safetyScore >= 75
    ? { label: 'Green Flag', color: 'text-green-400', bar: 'bg-green-400', bg: 'bg-green-900/20 border-green-800' }
    : safetyScore >= 40
    ? { label: 'Neutral', color: 'text-yellow-400', bar: 'bg-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800' }
    : { label: 'Red Flag', color: 'text-red-400', bar: 'bg-red-400', bg: 'bg-red-900/20 border-red-800' };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur border-b border-gray-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/10">
          <span className="material-icons">arrow_back</span>
        </button>
        <h1 className="font-bold text-lg truncate">{profile.name || 'Profile'}</h1>
        {profile.is_verified && (
          <span className="material-icons text-blue-400 text-lg ml-auto">verified</span>
        )}
      </div>

      {/* Photo carousel */}
      {photos.length > 0 ? (
        <div className="relative w-full bg-gray-800" style={{ height: '420px' }}>
          <img
            src={photos[photoIdx]}
            alt="Profile"
            className="w-full h-full object-cover"
          />
          {/* Photo dots */}
          {photos.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPhotoIdx(i)}
                  className={`w-2 h-2 rounded-full transition-all ${i === photoIdx ? 'bg-white w-4' : 'bg-white/40'}`}
                />
              ))}
            </div>
          )}
          {/* Tap zones for prev/next */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setPhotoIdx(i => Math.max(0, i - 1))}
                className="absolute left-0 top-0 h-full w-1/3"
                aria-label="Previous photo"
              />
              <button
                onClick={() => setPhotoIdx(i => Math.min(photos.length - 1, i + 1))}
                className="absolute right-0 top-0 h-full w-1/3"
                aria-label="Next photo"
              />
            </>
          )}
          {/* Name overlay */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-10">
            <h2 className="text-2xl font-bold">
              {profile.name}{profile.age ? `, ${profile.age}` : ''}
            </h2>
            {profile.location && (
              <p className="text-gray-300 text-sm flex items-center gap-1 mt-0.5">
                <span className="material-icons text-sm">place</span>{profile.location}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="w-full h-56 bg-gray-800 flex items-center justify-center">
          <span className="material-icons text-7xl text-gray-600">person</span>
        </div>
      )}

      <div className="px-4 py-5 space-y-4">

        {/* Safety Score card */}
        <div className={`rounded-2xl p-5 border ${tier.bg}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">Safety Score</p>
              <p className={`text-4xl font-black ${tier.color}`}>{safetyScore}<span className="text-lg font-normal text-gray-500">/100</span></p>
            </div>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${tier.color} bg-black/30`}>
              {safetyScore >= 75
                ? <span className="material-icons text-3xl">verified_user</span>
                : safetyScore >= 40
                ? <span className="material-icons text-3xl">info</span>
                : <span className="material-icons text-3xl">warning</span>
              }
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-700 rounded-full h-2.5 mb-3">
            <div
              className={`h-2.5 rounded-full ${tier.bar}`}
              style={{ width: `${safetyScore}%` }}
            />
          </div>

          {/* Indicators */}
          <div className="flex flex-wrap gap-3 text-sm">
            <div className={`flex items-center gap-1.5 font-bold ${tier.color}`}>
              <span className="material-icons text-base">flag</span>
              <span>{tier.label}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${redFlagCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              <span className="material-icons text-base">report</span>
              <span>{redFlagCount === 0 ? 'No reports' : `${redFlagCount} report${redFlagCount > 1 ? 's' : ''}`}</span>
            </div>
            {profile.gender_verified && (
              <div className="flex items-center gap-1.5 text-purple-400">
                <span className="material-icons text-base">how_to_reg</span>
                <span>ID Verified</span>
              </div>
            )}
            {profile.is_verified && (
              <div className="flex items-center gap-1.5 text-blue-400">
                <span className="material-icons text-base">verified</span>
                <span>Verified</span>
              </div>
            )}
          </div>
        </div>

        {/* Compatibility */}
        {profile.compatibility != null && (
          <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="material-icons text-pink-400">favorite</span>
                <span className="font-bold">Compatibility</span>
              </div>
              <span className="text-2xl font-black text-pink-400">{profile.compatibility}%</span>
            </div>
            {profile.sharedInterests?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <p className="w-full text-xs text-gray-500 mb-1">Shared interests:</p>
                {profile.sharedInterests.map(i => (
                  <span key={i} className="bg-pink-900/40 text-pink-300 text-xs px-2.5 py-0.5 rounded-full border border-pink-800">
                    {i}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div className="bg-gray-800 rounded-2xl p-4 border border-gray-700">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">About</p>
            <p className="text-gray-200 leading-relaxed text-sm">{profile.bio}</p>
          </div>
        )}

        {/* All interests */}
        {profile.interests?.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2">Interests</p>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map(i => (
                <span
                  key={i}
                  className={`text-sm px-3 py-1 rounded-full border ${
                    profile.sharedInterests?.includes(i)
                      ? 'bg-pink-900/30 border-pink-700 text-pink-300'
                      : 'bg-gray-800 border-gray-700 text-gray-300'
                  }`}
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
