/**
 * faceService.js — Own face detection system using face-api.js
 * Models are pre-downloaded in /public/models/ (no external API needed)
 *
 * Pipeline:
 *   1. loadModels()         — load neural nets from /public/models/
 *   2. detectFace(img)      — detect face, return bounding box + descriptor
 *   3. cropFaceBase64(img)  — crop the face region, return base64 JPEG
 */

import * as faceapi from 'face-api.js';

const MODELS_URL = '/models';
let modelsLoaded = false;

/**
 * Load all required face-api.js models (cached after first call)
 */
export async function loadModels() {
    if (modelsLoaded) return;
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]);
    modelsLoaded = true;
}

/**
 * Create an HTMLImageElement from a base64 data URL or File object
 */
function createImageElement(source) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        if (typeof source === 'string') {
            img.src = source;
        } else {
            // File object
            const url = URL.createObjectURL(source);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.src = url;
        }
    });
}

/**
 * Detect a single face in the image.
 * @param {File|string} source — File object or base64 string
 * @returns {{ detected: boolean, descriptor: Float32Array|null, box: object|null }}
 */
export async function detectFace(source) {
    await loadModels();
    const img = await createImageElement(source);

    // Primary detector: SSD MobileNet with relaxed confidence threshold
    let detection = await faceapi
        .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    // Fallback: TinyFaceDetector — more permissive for low-quality / angled photos
    if (!detection) {
        const tiny = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.3 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        detection = tiny || null;
    }

    if (!detection) {
        return { detected: false, descriptor: null, box: null };
    }

    return {
        detected: true,
        descriptor: detection.descriptor,
        box: detection.detection.box,
    };
}

/**
 * Detect all faces in an image (for group photo analysis)
 * @param {File|string} source
 * @returns {Array} — array of face detections with descriptors
 */
export async function detectAllFaces(source) {
    await loadModels();
    const img = await createImageElement(source);

    const detections = await faceapi
        .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

    return detections.map(d => ({
        detected: true,
        descriptor: d.descriptor,
        box: d.detection.box,
    }));
}

/**
 * Crop the detected face from the image and return as base64 JPEG.
 * Adds padding around the face for better context.
 * @param {File|string} source
 * @returns {string|null} — base64 data URL of cropped face, or null if no face found
 */
export async function cropFaceBase64(source) {
    await loadModels();
    const img = await createImageElement(source);

    const detection = await faceapi
        .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks();

    if (!detection) return null;

    const { x, y, width, height } = detection.alignedRect.box;

    // Add 40% padding around the face for natural framing
    const padding = Math.max(width, height) * 0.4;
    const cropX = Math.max(0, x - padding);
    const cropY = Math.max(0, y - padding);
    const cropW = Math.min(img.width - cropX, width + padding * 2);
    const cropH = Math.min(img.height - cropY, height + padding * 2);

    const canvas = document.createElement('canvas');
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return canvas.toDataURL('image/jpeg', 0.92);
}

/**
 * Compare two face descriptors and return similarity score (0–100)
 * Uses Euclidean distance — < 0.6 is same person
 */
export function compareFaces(descriptor1, descriptor2) {
    const distance = faceapi.euclideanDistance(descriptor1, descriptor2);
    // Convert distance to similarity percentage (distance 0 = 100%, distance 1 = 0%)
    const similarity = Math.max(0, Math.round((1 - distance) * 100));
    return { distance, similarity, match: distance < 0.6 };
}
