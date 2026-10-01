const cloudinary = require('cloudinary').v2;

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || 'dmpg70nvz';
const api_key = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY || '292517764532251';
const api_secret = process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET || 'WYJqd35a1Gk3ADbQnoVlzeWQU14';

cloudinary.config({
  cloud_name,
  api_key,
  api_secret,
  secure: true,
});

module.exports = cloudinary;
