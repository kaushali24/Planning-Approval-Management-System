const express = require('express');
const { body, param } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const adminConfigController = require('../controllers/adminConfigController');

const router = express.Router();

router.use(authMiddleware, requireRole(['admin']));

router.get('/documents', adminConfigController.getDocumentChecklistConfig);
router.get('/overview-stats', adminConfigController.getAdminOverviewStats);
router.get('/system-logs', adminConfigController.getSystemLogs);
router.get('/fees', adminConfigController.getFeeConfiguration);

router.patch(
  '/documents/:key',
  param('key').trim().notEmpty().withMessage('Document key is required'),
  body('displayName').trim().notEmpty().withMessage('displayName is required'),
  body('description').optional({ nullable: true }).isString(),
  body('isRequired').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
  body('sortOrder').optional().isInt({ min: 0, max: 10000 }),
  validateRequest,
  adminConfigController.upsertDocumentChecklistItem
);

router.patch(
  '/fees/:feeType',
  param('feeType').trim().notEmpty().withMessage('feeType is required'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a non-negative number'),
  validateRequest,
  adminConfigController.updateFeeConfigurationItem
);

module.exports = router;
