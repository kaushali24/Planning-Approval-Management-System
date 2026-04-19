const express = require('express');
const adminConfigController = require('../controllers/adminConfigController');

const router = express.Router();

router.get('/documents', adminConfigController.getDocumentChecklistConfig);
router.get('/fees', adminConfigController.getFeeConfiguration);

module.exports = router;
