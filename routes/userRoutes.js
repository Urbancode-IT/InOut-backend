const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const { uploadProfilePic } = require('../middleware/uploadProfile');
const { uploadSingle } = require('../middleware/uploadValidation');
const userController = require('../controllers/userController');

// Letter PDF: application/pdf, max 5MB (memory → Cloudinary in controller)
const uploadLetter = uploadSingle('letter', 'letterPdf');

// ✅ GET all users
router.get('/', auth, userController.getAllUsers);

// ✅ GET my profile (logged in user)
router.get('/me', auth, userController.getLoggedInUser);
router.post('/me/inout-unlock-seen', auth, userController.acknowledgeInoutUnlockNotice);


router.get('/profile',auth,userController.getProfile);

const { uploadAadharCard } = require('../middleware/uploadAadhar');

// Upload profile picture (JPG/PNG, max 2MB → Cloudinary under profile_pictures/<userId>)
router.post('/profile/upload', auth, uploadProfilePic, userController.uploadProfilePic);

// Upload Aadhar card image (JPG/PNG/PDF, max 5MB → Cloudinary under aadhar_cards/<userId>)
router.post('/profile/upload-aadhar', auth, uploadAadharCard, userController.uploadAadharCard);

// Upload generated letter PDF and store in Cloudinary under letter_copies/<candidateId>
router.post('/letters/upload', auth, uploadLetter, userController.uploadLetter);

router.put('/profile',auth, userController.updateProfile);
// ✅ GET schedules for admin

// ✅ GET user by ID
router.get('/:id', auth, role('admin'), userController.getSingleUser);

// ✅ UPDATE user
router.put('/:id', auth, role('admin'), userController.updateUser);


// ✅ DELETE user
// router.delete('/:id', auth, role('admin'), userController.deleteUser);

// ✅ UPDATE salary
router.put('/:id/salary', auth, role('admin'), userController.updateSalary);

module.exports = router;