const express = require('express');
const { body, param } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const staffController = require('../controllers/staffController');

const router = express.Router();

router.get(
  '/technical-officers',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  staffController.getTechnicalOfficers
);

router.get(
  '/admin/accounts',
  authMiddleware,
  requireRole(['admin']),
  staffController.getStaffAccounts
);

router.post(
  '/admin/accounts',
  authMiddleware,
  requireRole(['admin']),
  body('fullName').trim().notEmpty().withMessage('fullName is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('role')
    .isIn(['planning_officer', 'technical_officer', 'superintendent', 'committee'])
    .withMessage('role must be one of planning_officer, technical_officer, superintendent, committee'),
  validateRequest,
  staffController.createStaffAccount
);

router.patch(
  '/admin/accounts/:id/status',
  authMiddleware,
  requireRole(['admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid staff account id is required'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean'),
  validateRequest,
  staffController.updateStaffAccountStatus
);

module.exports = router;