const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');
const { createMulter, withUploadValidation } = require('./uploadValidation');

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    const userId = (req.user && req.user._id) ? String(req.user._id) : 'anonymous';
    return {
      folder: `aadhar_cards/${userId}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
      resource_type: 'auto'
    };
  }
});

const upload = createMulter('aadharCard', storage);

const uploadAadharCard = withUploadValidation(
  upload.single('aadharCard'),
  'aadharCard'
);

module.exports = {
  upload,
  uploadAadharCard
};
