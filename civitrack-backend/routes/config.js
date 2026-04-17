const express = require('express');
const adminConfigController = require('../controllers/adminConfigController');

const router = express.Router();

router.get('/documents', adminConfigController.getDocumentChecklistConfig);

module.exports = router;
