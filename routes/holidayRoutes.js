const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const holidayController = require('../controllers/holidayController');

// All authenticated users can read holidays (employees need this for calendar)
router.get('/', auth, holidayController.getAllHolidays);
router.get('/public', auth, holidayController.getHolidays);
router.get('/filter', auth, holidayController.getHolidays);

// Only admins can create/update/delete holidays
router.post('/', auth, role('admin'), holidayController.createHoliday);
router.put('/update/:id', auth, role('admin'), holidayController.updateHoliday);
router.delete('/delete/:id', auth, role('admin'), holidayController.deleteHoliday);
module.exports = router;