import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const AdComponent = ({
    slot,
    format = 'auto',
    responsive = 'true',
    style = { display: 'block' },
    layoutKey = ''
}) => {
    const { user } = useAuth();
    // Placeholder during development (since actual ads won't show on localhost usually)
    // In production, removing the 'bg-gray-100' wrapper might be cleaner.
    const isDev = import.meta.env.DEV;

    useEffect(() => {
        // Push ad to Google Ads queue
        if (user?.isPaid) return; // Skip if paid

        try {
            if (typeof window !== 'undefined' && (window.adsbygoogle = window.adsbygoogle || [])) {
                (window.adsbygoogle).push({});
            }
        } catch (e) {
            console.error("AdSense Error:", e);
        }
    }, [user?.isPaid]);

    // Don't render anything if user is paid or no real publisher ID is configured
    const publisherId = import.meta.env.VITE_ADSENSE_PUBLISHER_ID;
    if (user?.isPaid || !publisherId || publisherId.includes('XXXX')) {
        return null;
    }

    return (
        <div className="ad-container my-4 overflow-hidden rounded-lg border border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-black/20 flex flex-col items-center justify-center min-h-[100px]">
            {isDev && (
                <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none opacity-50">
                    <span className="text-xs font-mono text-gray-400">Ad Space ({slot})</span>
                </div>
            )}
            <ins
                className="adsbygoogle z-10 relative"
                style={style}
                data-ad-client={publisherId}
                data-ad-slot={slot}
                data-ad-format={format}
                data-full-width-responsive={responsive}
                data-ad-layout-key={layoutKey || undefined}
            />
            <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1 w-full text-center">Advertisement</div>
        </div>
    );
};

export default AdComponent;
