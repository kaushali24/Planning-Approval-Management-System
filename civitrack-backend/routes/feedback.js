const express = require('express');
const { body, param, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const feedbackController = require('../controllers/feedbackController');

const router = express.Router();
const STAFF_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];

router.post(
  '/',
  body('name').trim().notEmpty().isLength({ min: 2, max: 255 }).withMessage('Valid name is required'),
  body('email').trim().notEmpty().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('subject').trim().notEmpty().isLength({ min: 3, max: 255 }).withMessage('Valid subject is required'),
  body('message').trim().notEmpty().isLength({ min: 10, max: 3000 }).withMessage('Message must be between 10 and 3000 characters'),
  validateRequest,
  feedbackController.submitFeedback
);

router.get(
  '/',
  authMiddleware,
  requireRole(STAFF_ROLES),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['new', 'in_review', 'resolved', 'closed']),
  query('q').optional().isString().isLength({ max: 255 }),
  validateRequest,
  feedbackController.getFeedbackInbox
);

router.get(
  '/summary',
  authMiddleware,
  requireRole(STAFF_ROLES),
  feedbackController.getFeedbackSummary
);

router.patch(
  '/:id/read',
  authMiddleware,
  requireRole(STAFF_ROLES),
  param('id').isInt({ min: 1 }).withMessage('Valid feedback id is required'),
  validateRequest,
  feedbackController.markFeedbackAsRead
);

module.exports = router;
