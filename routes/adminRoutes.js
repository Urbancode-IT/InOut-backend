const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const adminController = require('../controllers/adminController');

router.get('/summary', auth, role('admin'), adminController.getAdminSummary);
router.get('/recent-attendance', auth, role('admin'), adminController.getRecentAttendance);
router.get('/recent-dashboard',auth,role('admin'),adminController.getRecentAttendanceDashboard)
router.get('/pending-users', auth, role('admin'), adminController.getPendingUsers);
router.post('/approve/:id', auth, role('admin'), adminController.approveUser);
router.delete('/reject/:id', auth, role('admin'), adminController.rejectUser);
// Get all uploaded letter copies (admin)
router.get('/letters', auth, role('admin'), adminController.getAllLetters);
// Force PDF download via API proxy (avoids browser/Cloudinary delivery quirks)
router.get('/letters/download', auth, role('admin'), adminController.downloadLetter);
router.post('/users/:id/unlock-attendance', auth, role('admin'), adminController.unlockAttendance);
router.put('/users/:id/unlock-attendance', auth, role('admin'), adminController.unlockAttendance);
router.post('/monthly-reports/send', auth, role('admin'), adminController.triggerMonthlyReports);

module.exports = router;