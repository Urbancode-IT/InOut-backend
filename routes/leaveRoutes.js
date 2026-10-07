const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const leaveController = require('../controllers/leaveController');

router.post('/apply', auth, leaveController.applyLeave);
router.get('/all', auth, role('admin'), leaveController.getAllLeaveRequests);
router.get('/me', auth, leaveController.getMyLeaves);
router.patch('/:id', auth, role('admin'), leaveController.updateLeaveStatus);
router.delete('/:id', auth, role('admin'), leaveController.deleteLeaveRequest);

module.exports = router;