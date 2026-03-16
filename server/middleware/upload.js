const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Use /tmp for writable storage on Render (ephemeral but works)
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/rf_uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4', 'video/quicktime', 'video/webm',
  // Audio
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav',
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uid = crypto.randomBytes(12).toString('hex');
    const ext = path.extname(file.originalname) || '';
    cb(null, `${uid}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
    cb(null, true);
  },
});

const BASE_URL = process.env.RENDER_EXTERNAL_URL ||
                 process.env.VITE_API_URL ||
                 'https://redflag-source.onrender.com';

// Cloudinary upload (if credentials are set)
async function uploadToCloudinary(filePath, folder) {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `redflag/${folder || 'media'}`,
      resource_type: 'auto',
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload failed, falling back to local URL:', err.message);
    return null;
  }
}

async function resolveFileUrl(req, fieldName) {
  if (!req.file) return;
  const folder = req.body?.folder || 'media';

  if (process.env.CLOUDINARY_CLOUD_NAME) {
    // Cloudinary configured — upload for a permanent CDN URL
    const cdnUrl = await uploadToCloudinary(req.file.path, folder);
    req.fileUrl = cdnUrl || `${BASE_URL}/api/files/${req.file.filename}`;
    if (cdnUrl) fs.unlink(req.file.path, () => {});
  } else if (req.file.mimetype.startsWith('image/') && req.file.size <= 2 * 1024 * 1024) {
    // No Cloudinary + small image → store as base64 data URL directly in DB.
    // This survives Render /tmp wipes since the data lives in PostgreSQL.
    const buf = fs.readFileSync(req.file.path);
    fs.unlink(req.file.path, () => {});
    req.fileUrl = `data:${req.file.mimetype};base64,${buf.toString('base64')}`;
  } else {
    // Large file or non-image (video/audio/doc) — use ephemeral local URL.
    // Note: this will break after a Render restart. Configure Cloudinary for persistence.
    req.fileUrl = `${BASE_URL}/api/files/${req.file.filename}`;
  }
}

// Combined middleware: multer + attach public URL
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    await resolveFileUrl(req);
    next();
  });
};

uploadMiddleware.single = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    await resolveFileUrl(req);
    next();
  });
};

module.exports = uploadMiddleware;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
