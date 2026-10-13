const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const role = require('../middleware/role');
const holidayController = require('../controllers/holidayController');

// Public (all authenticated users) — employees need this to show holidays on their calendar
router.get('/public', auth, holidayController.getHolidays);

router.get('/', auth, role('admin'), holidayController.getAllHolidays);
router.post('/', auth, role('admin'), holidayController.createHoliday);
router.get('/filter', auth, role('admin'), holidayController.getHolidays);
router.put('/update/:id', auth, role('admin'), holidayController.updateHoliday);
router.delete('/delete/:id', auth, role('admin'), holidayController.deleteHoliday);
module.exports = router;