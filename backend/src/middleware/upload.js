const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

const ALLOWED_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Files are stored under uploads/<companyId>/<category>/<timestamp>-<random>-<originalname>
// so each company's attachments stay physically separated on disk too.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.uploadCategory || 'misc';
    const companyId = req.companyId || 'unassigned';
    const dir = path.join(UPLOAD_ROOT, companyId, category);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${unique}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return cb(new Error('Unsupported file type. Allowed: PDF, PNG, JPG, WEBP'));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// Attaches the category (used for the folder name) before multer runs
function withCategory(category) {
  return (req, res, next) => { req.uploadCategory = category; next(); };
}

// Builds the public URL path for a stored file, relative to the API's static /uploads mount
function toPublicPath(file, companyId, category) {
  return `/uploads/${companyId}/${category}/${file.filename}`;
}

module.exports = { upload, withCategory, toPublicPath, UPLOAD_ROOT };
