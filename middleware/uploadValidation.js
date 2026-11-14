const multer = require('multer');

const MB = 1024 * 1024;

/** Shared presets for all upload endpoints */
const PRESETS = {
  profileImage: {
    allowedMimes: ['image/jpeg', 'image/png'],
    maxBytes: 2 * MB,
    typeLabel: 'JPG or PNG',
    maxLabel: '2MB',
  },
  letterPdf: {
    allowedMimes: ['application/pdf'],
    maxBytes: 5 * MB,
    typeLabel: 'PDF',
    maxLabel: '5MB',
  },
  aadharCard: {
    allowedMimes: ['image/jpeg', 'image/png', 'application/pdf'],
    maxBytes: 5 * MB,
    typeLabel: 'JPG, PNG or PDF',
    maxLabel: '5MB',
  },
};

function resolvePreset(preset) {
  if (typeof preset === 'string') {
    const config = PRESETS[preset];
    if (!config) throw new Error(`Unknown upload preset: ${preset}`);
    return config;
  }
  return preset;
}

function makeFileFilter(config) {
  const allowed = new Set(config.allowedMimes);
  return (req, file, cb) => {
    if (allowed.has(file.mimetype)) {
      return cb(null, true);
    }
    const err = new Error(
      `Invalid file type. Only ${config.typeLabel} files are allowed.`
    );
    err.code = 'INVALID_FILE_TYPE';
    cb(err);
  };
}

/**
 * Build a multer instance with MIME + size validation.
 * @param {string|object} preset - PRESETS key or custom config
 * @param {import('multer').StorageEngine} [storage] - defaults to memory
 */
function createMulter(preset, storage) {
  const config = resolvePreset(preset);
  return multer({
    storage: storage || multer.memoryStorage(),
    limits: { fileSize: config.maxBytes },
    fileFilter: makeFileFilter(config),
  });
}

/**
 * Map multer / fileFilter errors to a 400 JSON response.
 * Returns true if the error was handled.
 */
function sendUploadError(err, res, config) {
  if (!err) return false;

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        message: `File too large. Maximum size is ${config.maxLabel}.`,
        code: 'FILE_TOO_LARGE',
      });
      return true;
    }
    res.status(400).json({ message: err.message, code: err.code });
    return true;
  }

  if (err.code === 'INVALID_FILE_TYPE') {
    res.status(400).json({
      message: err.message,
      code: 'INVALID_FILE_TYPE',
    });
    return true;
  }

  return false;
}

/**
 * Wrap multer middleware so invalid type / oversized files get a 400
 * instead of falling through to the default Express error handler.
 *
 * @param {Function} multerMiddleware - e.g. upload.single('field')
 * @param {string|object} preset
 */
function withUploadValidation(multerMiddleware, preset) {
  const config = resolvePreset(preset);
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (sendUploadError(err, res, config)) return;
      return next(err);
    });
  };
}

/**
 * Convenience: validated single-file upload middleware.
 * @param {string} fieldName
 * @param {string|object} preset
 * @param {import('multer').StorageEngine} [storage]
 */
function uploadSingle(fieldName, preset, storage) {
  const upload = createMulter(preset, storage);
  return withUploadValidation(upload.single(fieldName), preset);
}

module.exports = {
  PRESETS,
  createMulter,
  withUploadValidation,
  uploadSingle,
  sendUploadError,
  makeFileFilter,
};
