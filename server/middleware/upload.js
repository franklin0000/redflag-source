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

// Combined middleware: multer + attach public URL
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (req.file) {
      req.fileUrl = `${BASE_URL}/api/files/${req.file.filename}`;
    }
    next();
  });
};

uploadMiddleware.single = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (req.file) {
      req.fileUrl = `${BASE_URL}/api/files/${req.file.filename}`;
    }
    next();
  });
};

module.exports = uploadMiddleware;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
