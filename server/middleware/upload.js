const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'), false);
    }
    cb(null, true);
  },
});

// Middleware: after multer, upload buffer to Cloudinary
const uploadToCloudinary = (req, res, next) => {
  if (!req.file) return next();
  const folder = req.body.folder || 'redflag';
  const stream = cloudinary.uploader.upload_stream(
    { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
    (error, result) => {
      if (error) return next(new Error('Cloudinary upload failed: ' + error.message));
      req.fileUrl = result.secure_url;
      req.filePublicId = result.public_id;
      next();
    }
  );
  streamifier.createReadStream(req.file.buffer).pipe(stream);
};

// Combined middleware
const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    uploadToCloudinary(req, res, next);
  });
};

uploadMiddleware.single = (fieldName) => (req, res, next) => {
  upload.single(fieldName)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    uploadToCloudinary(req, res, next);
  });
};

module.exports = uploadMiddleware;
