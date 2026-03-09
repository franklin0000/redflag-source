// storageService.js — File uploads via Render backend → Cloudinary
import { uploadFile } from './api';

/**
 * Upload a profile media file (photo, video)
 * @param {File} file
 * @param {string} userId
 * @param {string} type - 'photos' | 'videos' | 'evidence'
 * @returns {Promise<string>} public URL
 */
export async function uploadProfileMedia(file, userId, type = 'photos') {
    return uploadFile(file, `redflag/${userId}/${type}`);
}

/**
 * Upload a report evidence file
 */
export async function uploadEvidence(file, userId) {
    return uploadFile(file, `redflag/${userId}/evidence`);
}

/**
 * Upload a chat attachment
 */
export async function uploadChatAttachment(file, matchId) {
    return uploadFile(file, `redflag/chat/${matchId}`);
}

/**
 * Upload an avatar
 */
export async function uploadAvatar(file, userId) {
    return uploadFile(file, `redflag/${userId}/avatar`);
}

/**
 * Legacy: upload chat media (used in ChatRoom.jsx)
 */
export async function uploadChatMedia(file, room) {
    return uploadFile(file, `redflag/chat/${room}`);
}

export async function uploadCommunityMedia(file, userId) {
    return uploadFile(file, `redflag/${userId}/community`);
}

export async function uploadFlagMedia(file, userId) {
    return uploadFile(file, `redflag/${userId}/flags`);
}

export async function uploadReportMedia(file, userId) {
    return uploadFile(file, `redflag/${userId}/reports`);
}
