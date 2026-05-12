/**
 * simpleDashboard.js — Route definitions for /api/simple/*
 *
 * Mounts onto server.js as:
 *   app.use('/api/simple', require('./routes/simpleDashboard'));
 */

const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');

const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest } = require('../middleware/errorHandler');
const { upload, enforceMagicByteValidation } = require('../controllers/documentController');
const ctrl = require('../controllers/simpleDashboardController');

// ─── Validation ─────────────────────────────────────────────────────────────

const validateAdvance = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Application ID must be a positive integer'),
  body('status')
    .trim()
    .notEmpty()
    .withMessage('status is required')
    .isIn([
      'submitted',
      'verified',
      'payment_pending',
      'under_review',
      'hold_complaint',
      'hold_clearance',
      'correction',
      'sw_review_pending',
      'endorsed',
      'approved',
      'rejected',
      'closed',
    ])
    .withMessage('status must be one of the simplified workflow statuses'),
  body('notes')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('notes cannot exceed 2000 characters'),
  validateRequest,
];

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/simple/dashboard
 * Role-filtered application list + status counts.
 * Accessible by all authenticated users (applicants see own apps only).
 */
router.get('/dashboard', authMiddleware, ctrl.getDashboard);

/**
 * GET /api/simple/applications/:id
 * Full application detail: base data + documents + status history.
 */
router.get(
  '/applications/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  validateRequest,
  ctrl.getApplicationDetail
);

/**
 * POST /api/simple/applications/:id/advance
 * Move application to the next status in the simplified workflow.
 * Staff only (PO, SW, Committee, Admin).
 */
router.post(
  '/applications/:id/advance',
  authMiddleware,
  requireRole(['planning_officer', 'superintendent', 'committee', 'admin']),
  validateAdvance,
  ctrl.advanceApplication
);

/**
 * POST /api/simple/applications/:id/hold
 * TO places a hold (complaint/clearance/technical-deficiency) and sets canonical status.
 */
router.post(
  '/applications/:id/hold',
  authMiddleware,
  requireRole(['technical_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('hold_type').isIn(['complaint', 'clearance', 'technical-deficiency']).withMessage('Invalid hold_type'),
  body('reason').trim().isLength({ min: 3 }).withMessage('Reason is required'),
  body('clearance_authority').optional().isString(),
  body('complaint_source').optional().isString(),
  body('resolution_steps').optional().isString(),
  validateRequest,
  ctrl.placeHold
);

/**
 * POST /api/simple/applications/:id/resolve-hold
 * TO resolves the latest active hold and restores prior status.
 */
router.post(
  '/applications/:id/resolve-hold',
  authMiddleware,
  requireRole(['technical_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('resolution_note').trim().isLength({ min: 3 }).withMessage('resolution_note is required'),
  validateRequest,
  ctrl.resolveHold
);

/**
 * GET /api/simple/staff/to-list
 * Get list of TOs and their workload (PO / Admin only)
 */
router.get(
  '/staff/to-list',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  ctrl.getToList
);

/**
 * POST /api/simple/applications/:id/assign-to
 * Assign an application to a TO (PO / Admin only)
 */
router.post(
  '/applications/:id/assign-to',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('toStaffId').isInt({ min: 1 }).withMessage('toStaffId is required'),
  validateRequest,
  ctrl.assignTo
);

/**
 * POST /api/simple/applications/:id/set-fee
 * Planning officer sets inspection fee and moves status to payment_pending.
 */
router.post(
  '/applications/:id/set-fee',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a valid non-negative number'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
  validateRequest,
  ctrl.setFee
);

/**
 * POST /api/simple/applications/:id/confirm-payment
 * Planning officer confirms payment and moves status to under_review.
 */
router.post(
  '/applications/:id/confirm-payment',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
  validateRequest,
  ctrl.confirmPayment
);

/**
 * POST /api/simple/applications/:id/schedule-inspection
 * TO schedules an inspection
 */
router.post(
  '/applications/:id/schedule-inspection',
  authMiddleware,
  requireRole(['technical_officer', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('scheduled_date').isISO8601().withMessage('Valid scheduled_date required'),
  validateRequest,
  ctrl.scheduleInspection
);

/**
 * POST /api/simple/applications/:id/submit-to-report
 * TO submits inspection report + files
 */
router.post(
  '/applications/:id/submit-to-report',
  authMiddleware,
  requireRole(['technical_officer', 'admin']),
  upload.array('files', 5),
  enforceMagicByteValidation,
  param('id').isInt({ min: 1 }).withMessage('Invalid application ID'),
  body('observations').trim().isLength({ min: 10 }).withMessage('observations required (min 10 chars)'),
  body('recommendation').isIn(['approve', 'conditional', 'reject']).withMessage('recommendation must be approve | conditional | reject'),
  body('notes').optional().isString().trim().isLength({ max: 2000 }),
  validateRequest,
  ctrl.submitTOReport
);

module.exports = router;
