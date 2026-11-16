const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { parseRegisterUploads } = require('../middleware/uploadRegister');

router.post('/login', authController.login);
router.get('/check-availability', authController.checkAvailability);
router.post('/check-availability', authController.checkAvailability);
router.post('/register', parseRegisterUploads, authController.register);

module.exports = router;