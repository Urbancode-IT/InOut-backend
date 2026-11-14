const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const PUBLIC_API = (process.env.PUBLIC_API_URL || 'https://api.inout.urbancode.tech').replace(/\/$/, '');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label || 'upload timed out')), ms)
    ),
  ]);
}

function saveLocalFile(buffer, folder, fileName) {
  const uploadsDir = path.join(__dirname, '../uploads', folder);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
  return `${PUBLIC_API}/uploads/${folder}/${fileName}`;
}

function streamUpload(cloudinary, buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (result) resolve(result);
      else reject(error || new Error('Cloudinary upload returned no result'));
    });
    const readable = new Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    readable.pipe(stream);
  });
}

/**
 * Upload a registration file to local disk (always) and Cloudinary (best-effort).
 * Returns { url, filename, uploadedAt }.
 */
async function uploadRegisterFile(file, { folder, publicIdPrefix, resourceType }) {
  if (!file?.buffer) return null;

  const originalName = file.originalname || `${publicIdPrefix}`;
  const ext =
    path.extname(originalName) ||
    (file.mimetype === 'application/pdf'
      ? '.pdf'
      : file.mimetype === 'image/png'
        ? '.png'
        : '.jpg');
  const safeBase = originalName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const stamp = Date.now();
  const localName = `${publicIdPrefix}-${stamp}${ext}`;

  let fileUrl = saveLocalFile(file.buffer, folder, localName);

  try {
    const cloudinary = require('../config/cloudinary');
    const isPdf =
      file.mimetype === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
    const opts = {
      folder,
      resource_type: resourceType || (isPdf ? 'raw' : 'image'),
      public_id: `${safeBase}_${stamp}`,
    };
    const result = await withTimeout(
      streamUpload(cloudinary, file.buffer, opts),
      12000,
      `Cloudinary ${folder} upload timed out`
    );
    const cloudUrl = result.secure_url || result.url;
    if (cloudUrl) fileUrl = cloudUrl;
  } catch (err) {
    console.error(`Cloudinary upload skipped for ${folder}:`, err?.message || err);
  }

  return {
    url: fileUrl,
    filename: originalName,
    uploadedAt: new Date(),
  };
}

module.exports = { uploadRegisterFile };
