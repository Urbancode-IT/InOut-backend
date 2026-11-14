const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');

// Public — secure token in path only (no PII query params)
router.get('/accept/:token', offerController.getOfferByToken);
router.post('/accept/:token', offerController.acceptOffer);
router.post('/decline/:token', offerController.declineOffer);

module.exports = router;
