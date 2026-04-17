const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const cocController = require('../controllers/cocController');

const router = express.Router();

router.post(
  '/',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  body('application_id').isInt({ min: 1 }).withMessage('Valid application_id is required'),
  body('notes').optional().isString(),
  body('declarations').optional().isArray(),
  validateRequest,
  cocController.createCocRequest
);

router.get(
  '/',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  query('status').optional().isString(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest,
  cocController.getCocRequests
);

router.get(
  '/:id',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  validateRequest,
  cocController.getCocRequestById
);

router.patch(
  '/:id/status',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('status').notEmpty().isString().withMessage('status is required'),
  body('notes').optional().isString(),
  body('assigned_to').optional().isInt({ min: 1 }),
  body('fee_amount').optional().isFloat({ min: 0 }),
  validateRequest,
  cocController.updateCocStatus
);

router.post(
  '/:id/declarations',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('declaration_type')
    .isIn(['construction_complete', 'ready_for_inspection', 'understands_enforcement'])
    .withMessage('Invalid declaration_type'),
  body('accepted').optional().isBoolean(),
  validateRequest,
  cocController.addDeclaration
);

router.post(
  '/:id/payments',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a valid positive number'),
  body('payment_method').optional().isString(),
  body('transaction_id').optional().isString(),
  body('paid_at').optional().isISO8601().withMessage('paid_at must be a valid ISO date time'),
  validateRequest,
  cocController.submitApplicantPayment
);

router.post(
  '/:id/corrections',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('evidence_note').notEmpty().isString().withMessage('evidence_note is required'),
  validateRequest,
  cocController.submitCorrectionEvidence
);

router.post(
  '/:id/reinspection-request',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  validateRequest,
  cocController.requestApplicantReinspection
);

router.post(
  '/:id/violations',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('deviation_type').notEmpty().isString(),
  body('fine_amount').isFloat({ min: 0 }).withMessage('fine_amount must be >= 0'),
  body('comments').optional().isString(),
  body('no_appeal').optional().isBoolean(),
  body('inspection_type').optional().isIn(['initial-inspection', 'reinspection']),
  body('inspection_id').optional().isInt({ min: 1 }),
  validateRequest,
  cocController.addViolation
);

router.post(
  '/:id/reinspections',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid COC request id is required'),
  body('result').optional().isIn(['pending', 'compliant', 'deviation']),
  body('notes').optional().isString(),
  validateRequest,
  cocController.addReinspection
);

module.exports = router;
