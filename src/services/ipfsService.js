/**
 * ipfsService.js — File uploads via Cloudinary (replaces Supabase Storage)
 */
import { uploadFile } from './api';

export const uploadToIPFS = async (file) => {
    const url = await uploadFile(file, 'media');
    return {
        hash: url,
        url,
        metadata: {
            name: file.name,
            type: file.type,
            size: file.size,
            timestamp: Date.now(),
        },
    };
};

export const createMetadataJSON = async (name, description, imageCallbackUrl) => {
    const metadata = {
        name,
        description,
        image: imageCallbackUrl,
        attributes: [
            { trait_type: 'Platform', value: 'RedFlag Dating' },
            { trait_type: 'Verification', value: 'On-Chain' },
        ],
    };
    const blob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    return uploadToIPFS(new File([blob], 'metadata.json', { type: 'application/json' }));
};
