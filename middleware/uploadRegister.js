const multer = require('multer');
const { sendUploadError } = require('./uploadValidation');

const MB = 1024 * 1024;

const FIELD_RULES = {
  profilePic: {
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/png'],
    allowedExts: ['jpg', 'jpeg', 'png'],
    maxBytes: 2 * MB,
    typeLabel: 'JPG or PNG',
    maxLabel: '2MB',
  },
  resume: {
    allowedMimes: ['application/pdf'],
    allowedExts: ['pdf'],
    maxBytes: 5 * MB,
    typeLabel: 'PDF',
    maxLabel: '5MB',
  },
  aadharCard: {
    allowedMimes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    allowedExts: ['jpg', 'jpeg', 'png', 'pdf'],
    maxBytes: 5 * MB,
    typeLabel: 'JPG, PNG or PDF',
    maxLabel: '5MB',
  },
};

const getExt = (filename = '') => {
  const parts = String(filename).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * MB, files: 3 },
  fileFilter: (req, file, cb) => {
    const rule = FIELD_RULES[file.fieldname];
    if (!rule) {
      const err = new Error(`Unexpected upload field: ${file.fieldname}`);
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    const ext = getExt(file.originalname);
    const mimeOk = !file.mimetype || rule.allowedMimes.includes(file.mimetype);
    const extOk = rule.allowedExts.includes(ext);
    if (!mimeOk || !extOk) {
      const err = new Error(
        `Invalid ${file.fieldname} type. Only ${rule.typeLabel} files are allowed.`
      );
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    return cb(null, true);
  },
});

const parseRegisterUploads = (req, res, next) => {
  upload.fields([
    { name: 'profilePic', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      // Prefer field-specific labels when available
      const field = err.field || err?.storageErrors?.[0]?.field;
      const config = FIELD_RULES[field] || {
        maxLabel: '5MB',
        typeLabel: 'allowed',
      };
      if (sendUploadError(err, res, config)) return;
      return next(err);
    }

    // Enforce per-field size limits (multer uses the global max)
    for (const [field, rule] of Object.entries(FIELD_RULES)) {
      const file = req.files?.[field]?.[0];
      if (file && file.size > rule.maxBytes) {
        return res.status(400).json({
          error: `File too large for ${field}. Maximum size is ${rule.maxLabel}.`,
          code: 'FILE_TOO_LARGE',
        });
      }
    }

    return next();
  });
};

module.exports = { parseRegisterUploads, FIELD_RULES };
