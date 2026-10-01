const { uploadSingle } = require('./uploadValidation');

const uploadAadharCard = uploadSingle('aadharCard', 'aadharCard');

module.exports = {
  uploadAadharCard,
};
