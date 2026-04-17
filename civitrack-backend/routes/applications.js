const express = require('express');
const { body, param, query } = require('express-validator');
const applicationController = require('../controllers/applicationController');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middleware/auth');
const { validateRequest, sendError } = require('../middleware/errorHandler');
const { requireRole, isApplicationOwner } = require('../middleware/roleBasedAccess');
const pool = require('../config/db');
const {
  APPLICATION_TYPES,
  APPLICATION_PERMIT_CODES,
  APPLICATION_STATUSES,
  SRI_LANKA_NIC_REGEX,
} = require('../utils/applicationValidation');

const router = express.Router();

/**
 * Input validation middleware
 */
const validateCreateApplication = [
  body('application_type')
    .trim()
    .notEmpty().withMessage('Application type is required')
    .isIn(APPLICATION_TYPES)
    .withMessage('Invalid application type'),
  body('submitted_applicant_name')
    .trim()
    .notEmpty().withMessage('Applicant name is required')
    .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
  body('submitted_nic_number')
    .trim()
    .notEmpty().withMessage('NIC number is required')
    .matches(SRI_LANKA_NIC_REGEX).withMessage('Invalid NIC format'),
  body('submitted_email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('submitted_address')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 5, max: 1000 }).withMessage('Address must be between 5 and 1000 characters'),
  body('submitted_contact')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 7, max: 20 }).withMessage('Contact number must be between 7 and 20 characters'),
  body('selected_permit_codes')
    .optional({ nullable: true })
    .custom((value) => {
      if (Array.isArray(value)) {
        return value.length > 0 && value.every((item) => APPLICATION_PERMIT_CODES.includes(item));
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => APPLICATION_PERMIT_CODES.includes(item));
        } catch {
          return false;
        }
      }
      return true;
    }).withMessage('Invalid selected permit codes'),
  validateRequest,
];

const validateUpdateStatus = [
  body('status')
    .trim()
    .notEmpty().withMessage('Status is required')
    .isIn(APPLICATION_STATUSES).withMessage('Invalid status'),
  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Notes cannot exceed 2000 characters')
    .custom((value, { req }) => {
      const noteRequiredStatuses = ['rejected', 'correction', 'not_granted_appeal_required'];
      if (noteRequiredStatuses.includes(req.body.status) && (!value || value.trim().length < 5)) {
        throw new Error('Notes (min 5 characters) are required for this status transition');
      }
      return true;
    }),
  validateRequest,
];

const validateAssign = [
  body('assigned_to')
    .notEmpty().withMessage('Staff member identifier is required')
    .trim()
    .isLength({ min: 1, max: 255 }).withMessage('Invalid staff member identifier format'),
  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Assignment notes cannot exceed 2000 characters'),
  validateRequest,
];

const validateDraftUpdate = [
  body('application_type')
    .optional({ nullable: true })
    .trim()
    .isIn(APPLICATION_TYPES)
    .withMessage('Invalid application type'),
  body('submitted_applicant_name')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
  body('submitted_nic_number')
    .optional({ nullable: true })
    .trim()
    .matches(SRI_LANKA_NIC_REGEX).withMessage('Invalid NIC format'),
  body('submitted_email')
    .optional({ nullable: true })
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  body('submitted_address')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 5, max: 1000 }).withMessage('Address must be between 5 and 1000 characters'),
  body('submitted_contact')
    .optional({ nullable: true })
    .trim()
    .isLength({ min: 7, max: 20 }).withMessage('Contact number must be between 7 and 20 characters'),
  body('selected_permit_codes')
    .optional({ nullable: true })
    .custom((value) => {
      if (Array.isArray(value)) {
        return value.every((item) => APPLICATION_PERMIT_CODES.includes(item));
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) && parsed.every((item) => APPLICATION_PERMIT_CODES.includes(item));
        } catch {
          return false;
        }
      }
      return true;
    }).withMessage('Invalid selected permit codes'),
  body('assessment_number')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Assessment number must be max 100 characters'),
  body('deed_number')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Deed number must be max 100 characters'),
  body('survey_plan_ref')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Survey plan reference must be max 100 characters'),
  body('land_extent')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Land extent must be max 100 characters'),
  body('project_details')
    .optional({ nullable: true })
    .isObject().withMessage('Project details must be an object'),
  body('latitude')
    .optional({ nullable: true })
    .isDecimal().withMessage('Latitude must be a decimal number'),
  body('longitude')
    .optional({ nullable: true })
    .isDecimal().withMessage('Longitude must be a decimal number'),
  body('declaration_accepted')
    .optional({ nullable: true })
    .isBoolean().withMessage('Declaration must be a boolean'),
  validateRequest,
];

const validateUploadDocuments = [
  body('doc_types')
    .optional({ nullable: true })
    .custom((value) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      return false;
    })
    .withMessage('doc_types must be a non-empty array or JSON array string'),
  validateRequest,
];

/**
 * PUBLIC ROUTES (protected by auth)
 */

/**
 * POST /api/applications
 * Create a new application
 */
router.post(
  '/',
  authMiddleware,
  requireRole(['applicant']),
  validateCreateApplication,
  applicationController.createApplication
);

/**
 * GET /api/applications
 * Get applications (filtered by role)
 */
router.get(
  '/stats/summary',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  applicationController.getApplicationStats
);

/**
 * GET /api/applications
 * Get applications with advanced filtering, search, and sorting
 * Query params:
 *   - search: Search by applicant name (partial match, case-insensitive)
 *   - status: Filter by status
 *   - type: Filter by application type
 *   - fromDate: Filter from date (YYYY-MM-DD)
 *   - toDate: Filter to date (YYYY-MM-DD)
 *   - sort: Sort field (submission_date|status|type|applicant_name|updated) with direction (ASC|DESC), e.g., "submission_date:DESC"
 *   - page: Page number (default: 1)
 *   - limit: Records per page (default: 20, max: 100)
 */
router.get(
  '/',
  authMiddleware,
  query('search').optional().trim().isLength({ max: 255 }).withMessage('Search query must be max 255 characters'),
  query('status').optional().trim().isIn(APPLICATION_STATUSES).withMessage('Invalid status filter'),
  query('type').optional().trim().isIn(APPLICATION_TYPES).withMessage('Invalid application type filter'),
  query('fromDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('fromDate must be in YYYY-MM-DD format'),
  query('toDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('toDate must be in YYYY-MM-DD format'),
  query('sort').optional().trim().matches(/^(submission_date|status|type|applicant_name|updated):(ASC|DESC)$/).withMessage('Invalid sort format (use field:ASC|DESC)'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest,
  applicationController.getApplications
);

/**
 * GET /api/applications/:id
 * Get single application
 */
router.get(
  '/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.getApplicationById
);

/**
 * PATCH /api/applications/:id/status
 * Update application status (staff/admin only)
 */
router.patch(
  '/:id/status',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }),
  validateUpdateStatus,
  applicationController.updateApplicationStatus
);

/**
 * PATCH /api/applications/:id
 * Update application details
 */
router.patch(
  '/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  isApplicationOwner(pool),
  [
    body('submitted_applicant_name')
      .optional({ nullable: true })
      .trim()
      .isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
    body('submitted_email')
      .optional({ nullable: true })
      .trim()
      .isEmail().withMessage('Invalid email format')
      .normalizeEmail(),
    validateRequest,
  ],
  applicationController.updateApplication
);

/**
 * POST /api/applications/:id/assign
 * Assign application to staff (planning officer/admin)
 */
router.post(
  '/:id(\\d+)/assign',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  param('id').isInt({ min: 1 }),
  validateRequest,
  validateAssign,
  applicationController.assignApplication
);

/**
 * GET /api/applications/:id/assignments
 * Get application assignment history
 */
router.get(
  '/:id/assignments',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  applicationController.getApplicationAssignments
);

/**
 * DELETE /api/applications/:id
 * Delete application (only if pending)
 */
router.delete(
  '/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.deleteApplication
);

/**
 * DRAFT MANAGEMENT ENDPOINTS
 * ===========================
 */

/**
 * PATCH /api/applications/:id/draft
 * Save draft data (partial form save, no validation required)
 * Applicants only - save to draft status application
 */
router.patch(
  '/:id/draft',
  authMiddleware,
  requireRole(['applicant']),
  param('id').isInt({ min: 1 }),
  validateDraftUpdate,
  isApplicationOwner(pool),
  applicationController.saveDraft
);

/**
 * GET /api/applications/:id/draft
 * Retrieve draft data
 * Applicants only - fetch draft application data
 */
router.get(
  '/:id/draft',
  authMiddleware,
  requireRole(['applicant']),
  param('id').isInt({ min: 1 }),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.getDraft
);

/**
 * DELETE /api/applications/:id/draft
 * Clear draft data (reset to minimal fields)
 * Applicants only - clear draft data
 */
router.delete(
  '/:id/draft',
  authMiddleware,
  requireRole(['applicant']),
  param('id').isInt({ min: 1 }),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.clearDraft
);

/**
 * APPLICATION DOCUMENT ENDPOINTS (STEP 6)
 * =======================================
 */
router.post(
  '/:id/documents',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }),
  validateRequest,
  documentController.upload.array('files', 20),
  validateUploadDocuments,
  applicationController.uploadApplicationDocuments
);

router.get(
  '/:id/documents',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  applicationController.getApplicationDocuments
);

router.delete(
  '/:applicationId/documents/:documentId',
  authMiddleware,
  param('applicationId').isInt({ min: 1 }),
  param('documentId').isInt({ min: 1 }),
  validateRequest,
  applicationController.deleteApplicationDocument
);

router.post(
  '/:id/payment-proof',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a valid positive number'),
  body('payment_method').isIn(['bank', 'counter']).withMessage('payment_method must be bank or counter'),
  body('reference_no').optional({ nullable: true }).isString(),
  body('submitted_at').optional({ nullable: true }).isISO8601().withMessage('submitted_at must be a valid ISO date time'),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.submitApplicationPaymentProof
);

router.post(
  '/:id/payments/online',
  authMiddleware,
  requireRole(['applicant', 'planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  param('id').isInt({ min: 1 }).withMessage('Valid application id is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a valid positive number'),
  body('transaction_id').optional({ nullable: true }).isString(),
  body('receipt_id').optional({ nullable: true }).isString(),
  body('paid_at').optional({ nullable: true }).isISO8601().withMessage('paid_at must be a valid ISO date time'),
  validateRequest,
  isApplicationOwner(pool),
  applicationController.recordApplicationOnlinePayment
);

/**
 * POST /api/applications/:id/draft/submit
 * Submit draft as full application (converts draft to submitted)
 * Requires full validation - all mandatory fields must be present
 */
router.post(
  '/:id/draft/submit',
  authMiddleware,
  requireRole(['applicant']),
  param('id').isInt({ min: 1 }),
  validateCreateApplication,
  isApplicationOwner(pool),
  applicationController.submitDraft
);

/**
 * BATCH OPERATIONS ENDPOINTS (STEP 5)
 * ====================================
 */

/**
 * POST /api/applications/batch/status-updates
 * Bulk status updates for multiple applications
 * Staff/Admin only - update statuses for multiple applications in single transaction
 * 
 * Request body:
 * {
 *   updates: [
 *     { applicationId, newStatus, notes? },
 *     ...
 *   ]
 * }
 * 
 * Response: { successCount, failureCount, results: [{applicationId, success, message}] }
 * 
 * Notes:
 * - All updates execute as single transaction - rollback on first failure
 * - Each update validated against workflow rules and role permissions
 * - Sensitive statuses (rejected, correction) require notes (min 5 chars)
 * - Maximum 1000 updates per batch
 */
const validateBatchStatusUpdates = [
  body('updates')
    .isArray({ min: 1 })
    .withMessage('Updates must be a non-empty array'),
  body('updates.*.applicationId')
    .isInt({ min: 1 })
    .withMessage('Each update must have a valid applicationId'),
  body('updates.*.newStatus')
    .trim()
    .notEmpty().withMessage('New status is required')
    .isIn(APPLICATION_STATUSES).withMessage('Invalid status'),
  body('updates.*.notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 }).withMessage('Notes cannot exceed 2000 characters'),
  validateRequest,
];

router.post(
  '/batch/status-updates',
  authMiddleware,
  requireRole(['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin']),
  validateBatchStatusUpdates,
  applicationController.batchUpdateStatus
);

/**
 * POST /api/applications/batch/assign
 * Bulk application assignments for multiple applications
 * Planning Officer/Admin - assign multiple applications to staff members in single transaction
 * 
 * Request body:
 * {
 *   assignments: [
 *     { applicationId, assignedTo },
 *     ...
 *   ]
 * }
 * 
 * Response: { successCount, failureCount, results: [{applicationId, success, message}] }
 * 
 * Notes:
 * - All assignments execute as single transaction - rollback on first failure
 * - Each assignment validated for application and staff member existence
 * - Updates existing assignment or creates new one
 * - Maximum 1000 assignments per batch
 */
const validateBatchAssignments = [
  body('assignments')
    .isArray({ min: 1 })
    .withMessage('Assignments must be a non-empty array'),
  body('assignments.*.applicationId')
    .isInt({ min: 1 })
    .withMessage('Each assignment must have a valid applicationId'),
  body('assignments.*.assignedTo')
    .notEmpty()
    .withMessage('Each assignment must have a valid assignedTo value'),
  body('assignments.*.notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Assignment notes cannot exceed 2000 characters'),
  validateRequest,
];

router.post(
  '/batch/assign',
  authMiddleware,
  requireRole(['planning_officer', 'admin']),
  validateBatchAssignments,
  applicationController.batchAssignApplications
);

router.use((err, req, res, next) => {
  if (err instanceof Error && err.message.includes('file type')) {
    return sendError(res, 400, err.message, { code: 'INVALID_FILE_TYPE' });
  }
  if (err instanceof Error && err.message.includes('File too large')) {
    return sendError(res, 413, 'File too large. Maximum 10MB allowed.', { code: 'FILE_TOO_LARGE' });
  }
  return next(err);
});

module.exports = router;
