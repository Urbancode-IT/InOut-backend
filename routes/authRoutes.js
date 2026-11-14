const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { parseRegisterUploads } = require('../middleware/uploadRegister');

router.post('/login', authController.login);
router.post('/register', parseRegisterUploads, authController.register);

module.exports = router;