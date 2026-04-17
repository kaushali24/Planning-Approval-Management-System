const express = require('express');
const { body, param } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const inspectionController = require('../controllers/inspectionController');

const router = express.Router();

router.get(
  '/my',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  inspectionController.getMyInspections
);

router.post(
  '/application/:applicationId/schedule',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('scheduled_date').isISO8601().withMessage('scheduled_date must be a valid ISO date time'),
  validateRequest,
  inspectionController.scheduleInspectionForApplication
);

router.post(
  '/application/:applicationId/report',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('recommendation').isIn(['approve', 'conditional', 'reject', 'not-granted']).withMessage('Invalid recommendation'),
  body('observations').optional().isString(),
  body('result').optional().isIn(['pending', 'compliant', 'deviation']),
  validateRequest,
  inspectionController.submitInspectionReportForApplication
);

router.post(
  '/application/:applicationId/hold',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('hold_type').isIn(['complaint', 'clearance', 'technical-deficiency']).withMessage('Invalid hold_type'),
  body('reason').trim().isLength({ min: 3 }).withMessage('Reason is required'),
  body('clearance_authority').optional().isString(),
  validateRequest,
  inspectionController.placeHoldForApplication
);

router.post(
  '/application/:applicationId/resolve-hold',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('resolution_note').trim().isLength({ min: 3 }).withMessage('resolution_note is required'),
  validateRequest,
  inspectionController.resolveHoldForApplication
);

router.post(
  '/application/:applicationId/decline-assignment',
  authMiddleware,
  requireRole(['technical_officer', 'superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('reason').trim().isLength({ min: 3 }).withMessage('reason is required'),
  validateRequest,
  inspectionController.declineAssignmentForApplication
);

router.post(
  '/application/:applicationId/sw-refer-back',
  authMiddleware,
  requireRole(['superintendent', 'admin']),
  param('applicationId').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('reason').trim().isLength({ min: 3 }).withMessage('reason is required'),
  body('referral_type').isIn(['reinspection', 'report-correction', 'additional-information']).withMessage('Invalid referral_type'),
  validateRequest,
  inspectionController.referBackToTechnicalOfficerForApplication
);

module.exports = router;
