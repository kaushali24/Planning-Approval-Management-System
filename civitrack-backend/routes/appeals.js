const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const appealController = require('../controllers/appealController');

const router = express.Router();

router.post(
  '/',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  body('application_id').isInt({ min: 1 }).withMessage('Valid application_id is required'),
  body('route').optional().isIn(['committee', 'planning-section', 'technical-officer', 'superintendent']),
  body('additional_fee').optional().isFloat({ min: 0 }),
  body('summary').optional().isString(),
  body('corrections_category').optional().isIn(['documents', 'plans', 'mixed']),
  body('special_circumstances').optional().isString(),
  body('contains_new_plans').optional().isBoolean(),
  body('documents').optional().isArray(),
  validateRequest,
  appealController.createAppealCase
);

router.get(
  '/',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  query('status').optional().isString(),
  query('route').optional().isString(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest,
  appealController.getAppealCases
);

router.get(
  '/:id',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid appeal case id is required'),
  validateRequest,
  appealController.getAppealCaseById
);

router.post(
  '/:id/versions',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid appeal case id is required'),
  body('summary').optional().isString(),
  body('corrections_category').optional().isIn(['documents', 'plans', 'mixed']),
  body('special_circumstances').optional().isString(),
  body('contains_new_plans').optional().isBoolean(),
  body('documents').optional().isArray(),
  validateRequest,
  appealController.addAppealVersion
);

router.post(
  '/:id/notes',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid appeal case id is required'),
  body('note').notEmpty().isString().withMessage('note is required'),
  validateRequest,
  appealController.addAppealMemberNote
);

router.patch(
  '/:id/status',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid appeal case id is required'),
  body('status').notEmpty().isString().withMessage('status is required'),
  body('route').optional().isIn(['committee', 'planning-section', 'technical-officer', 'superintendent']),
  body('portal_open').optional().isBoolean(),
  body('additional_fee').optional().isFloat({ min: 0 }),
  validateRequest,
  appealController.updateAppealStatus
);

module.exports = router;
