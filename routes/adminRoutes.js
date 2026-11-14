const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const adminController = require('../controllers/adminController');
const offerController = require('../controllers/offerController');

router.get('/summary', auth, role('admin'), adminController.getAdminSummary);
router.get('/recent-attendance', auth, role('admin'), adminController.getRecentAttendance);
router.get('/recent-dashboard',auth,role('admin'),adminController.getRecentAttendanceDashboard)
router.get('/pending-users', auth, role('admin'), adminController.getPendingUsers);
router.get('/pending-users/:id', auth, role('admin'), offerController.getPendingUserById);
router.post('/pending-users/:id/prepare-offer', auth, role('admin'), offerController.prepareOffer);
router.get('/offers/:userId', auth, role('admin'), offerController.getOffer);
router.put('/offers/:userId/details', auth, role('admin'), offerController.saveOfferDetails);
router.post('/offers/:userId/generated', auth, role('admin'), offerController.recordGeneratedPdf);
router.post('/offers/:userId/send', auth, role('admin'), offerController.sendOffer);
router.post('/offers/:userId/accept', auth, role('admin'), offerController.acceptOfferAsAdmin);
router.post('/approve/:id', auth, role('admin'), adminController.approveUser);
router.delete('/reject/:id', auth, role('admin'), adminController.rejectUser);
// Get all uploaded letter copies (admin)
router.get('/letters', auth, role('admin'), adminController.getAllLetters);
// Force PDF download via API proxy (avoids browser/Cloudinary delivery quirks)
router.get('/letters/download', auth, role('admin'), adminController.downloadLetter);
router.post('/users/:id/unlock-attendance', auth, role('admin'), adminController.unlockAttendance);
router.put('/users/:id/unlock-attendance', auth, role('admin'), adminController.unlockAttendance);
router.post('/monthly-reports/send', auth, role('admin'), adminController.triggerMonthlyReports);
router.post('/payslips/auto-send', auth, role('admin'), adminController.triggerAutoPayslipMails);

router.post('/send-document-email', auth, role('admin'), adminController.sendDocumentEmail);

module.exports = router;