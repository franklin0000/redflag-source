/**
 * faceCheck.js — FaceCheck.id Face Recognition API
 *
 * FaceCheck.id finds the SAME PERSON across different photos on the internet
 * (real face recognition, not just reverse image matching).
 *
 * API docs: https://facecheck.id/Face-Search/API
 * Proxy: Vite proxies /api → https://facecheck.id (see vite.config.js)
 */

const API_TOKEN = import.meta.env.VITE_FACECHECK_TOKEN || '';

const BASE = import.meta.env.VITE_API_URL || '';

// Use real mode when token is set, testing mode otherwise.
// Testing mode: inaccurate results but credits NOT deducted.
export const isTestingMode = () => {
    if (!API_TOKEN) return true;
    const stored = localStorage.getItem('faceCheck_testMode');
    if (stored !== null) return stored === 'true';
    return false; // real mode by default when token is present
};

/** Known adult/escort platforms for automatic result categorization */
const ADULT_PLATFORMS = [
    { domain: 'leolist.cc', name: 'Leolist', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'skokka.com', name: 'Skokka', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'skokka.in', name: 'Skokka', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'megapersonals.eu', name: 'MegaPersonals', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'adultsearch.com', name: 'AdultSearch', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'listcrawler.com', name: 'ListCrawler', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'eros.com', name: 'Eros', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'tryst.link', name: 'Tryst', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'slixa.com', name: 'Slixa', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'cityvibe.com', name: 'CityVibe', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'humaniplex.com', name: 'Humaniplex', category: 'Escort 🚩', icon: 'warning' },
    { domain: 'onlyfans.com', name: 'OnlyFans', category: 'Adult Content 🔞', icon: 'lock' },
    { domain: 'fansly.com', name: 'Fansly', category: 'Adult Content 🔞', icon: 'lock' },
    { domain: 'manyvids.com', name: 'ManyVids', category: 'Adult Content 🔞', icon: 'lock' },
    { domain: 'fanvue.com', name: 'Fanvue', category: 'Adult Content 🔞', icon: 'lock' },
    { domain: 'pornhub.com', name: 'Pornhub', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'xvideos.com', name: 'XVideos', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'xhamster.com', name: 'xHamster', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'redtube.com', name: 'RedTube', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'xnxx.com', name: 'XNXX', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'youporn.com', name: 'YouPorn', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'spankbang.com', name: 'SpankBang', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'eporner.com', name: 'Eporner', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'beeg.com', name: 'Beeg', category: 'Adult Video 🔞', icon: 'videocam' },
    { domain: 'cam4.com', name: 'Cam4', category: 'Live Cam 🔞', icon: 'videocam' },
    { domain: 'chaturbate.com', name: 'Chaturbate', category: 'Live Cam 🔞', icon: 'videocam' },
    { domain: 'stripchat.com', name: 'StripChat', category: 'Live Cam 🔞', icon: 'videocam' },
    { domain: 'bongacams.com', name: 'BongaCams', category: 'Live Cam 🔞', icon: 'videocam' },
    { domain: 'myfreecams.com', name: 'MyFreeCams', category: 'Live Cam 🔞', icon: 'videocam' },
];

function matchAdultPlatform(url) {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        return ADULT_PLATFORMS.find(p => hostname === p.domain || hostname.endsWith('.' + p.domain)) || null;
    } catch {
        return null;
    }
}

function getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

/** Build targeted Google search links for adult platforms (always appended to results) */
export function buildTargetedSearches(name) {
    return ADULT_PLATFORMS.map(platform => ({
        score: 50,
        url: `https://www.google.com/search?q=${encodeURIComponent(
            name ? `site:${platform.domain} "${name}"` : `site:${platform.domain}`
        )}`,
        group: platform.category,
        title: `Search on ${platform.name}`,
        icon: platform.icon,
        isRisk: true,
        isTargetedSearch: true,
        base64: null,
    }));
}

/** Format raw FaceCheck.id items into SearchResults-compatible objects */
function formatItems(items) {
    return items.map(item => {
        const platform = matchAdultPlatform(item.url);
        return {
            score: item.score,
            url: item.url,
            group: platform ? platform.category : 'Face Match',
            title: platform ? `${platform.name} — ${getDomain(item.url)}` : getDomain(item.url),
            icon: platform ? platform.icon : 'face',
            isRisk: !!platform,
            base64: item.base64 ? `data:image/jpeg;base64,${item.base64}` : null,
        };
    });
}

export async function uploadPhoto(fileObject) {
    const url = `${BASE}/api/upload_pic`;

    const formData = new FormData();
    formData.append('images', fileObject);
    formData.append('id_search', '');

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': API_TOKEN },
            body: formData,
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('FaceCheck upload error:', error);
        return { error: error.message, code: 'UPLOAD_FAILED' };
    }
}

export async function pollResults(idSearch, onProgress) {
    const url = `${BASE}/api/search`;
    const testingMode = isTestingMode();
    const payload = {
        id_search: idSearch,
        with_progress: true,
        status_only: false,
        demo: testingMode,
    };

    let attempts = 0;
    const maxAttempts = 90; // 90 seconds max

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': API_TOKEN,
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (data.error) {
                return { error: data.error, code: data.code };
            }

            if (data.output) {
                const rawItems = data.output.items || [];
                const formatted = formatItems(rawItems);
                const targeted = buildTargetedSearches(null);
                // Real hits first, then platform search buttons
                return { items: [...formatted, ...targeted] };
            }

            if (data.progress !== undefined) {
                if (onProgress) onProgress(data.progress);
            }

            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error('FaceCheck poll error:', error);
            return { error: error.message, code: 'POLLING_FAILED' };
        }
    }

    return { error: 'Timeout — FaceCheck queue is long. Try again later.', code: 'TIMEOUT' };
}
