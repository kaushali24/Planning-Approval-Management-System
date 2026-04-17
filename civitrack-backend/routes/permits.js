const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const permitController = require('../controllers/permitController');

const router = express.Router();

router.post(
  '/:applicationId/issue',
  authMiddleware,
  requireRole(['superintendent', 'committee', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid applicationId is required'),
  body('valid_until').isISO8601().withMessage('valid_until is required and must be a valid date'),
  body('permit_reference').optional().isString(),
  body('max_years').optional().isInt({ min: 1, max: 10 }),
  validateRequest,
  permitController.issuePermit
);

router.get(
  '/reports/expiring',
  authMiddleware,
  requireRole(['planning_officer', 'superintendent', 'admin']),
  query('days').optional().isInt({ min: 1, max: 90 }).toInt(),
  validateRequest,
  permitController.getExpiringPermits
);

router.get(
  '/:applicationId',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid applicationId is required'),
  validateRequest,
  permitController.getPermitByApplication
);

router.post(
  '/:applicationId/extend',
  authMiddleware,
  requireRole(['planning_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid applicationId is required'),
  body('payment_status').optional().isIn(['pending', 'completed', 'failed']),
  body('payment_reference').optional().isString(),
  body('payment_method').optional().isString(),
  body('notes').optional().isString(),
  validateRequest,
  permitController.extendPermit
);

router.post(
  '/:applicationId/collect',
  authMiddleware,
  requireRole(['planning_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid applicationId is required'),
  body('checks').optional().isArray(),
  validateRequest,
  permitController.collectPermit
);

module.exports = router;
