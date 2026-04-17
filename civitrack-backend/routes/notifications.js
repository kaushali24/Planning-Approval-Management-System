const express = require('express');
const { body } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/roleBasedAccess');
const { validateRequest, sendError } = require('../middleware/errorHandler');
const pool = require('../config/db');
const {
  sendApplicationToSWNotification,
  sendApplicationToCommitteeNotification,
  sendApplicationReferralNotificationToTO,
  sendApplicantApprovalEmail,
  sendApplicantPermitCollectedEmail,
  sendPermitExpiringSoonEmail,
  sendPermitExpiredEmail,
  sendPermitExtendedEmail,
  sendApplicantCorrectionsEmail,
  sendApplicantInspectionScheduledEmail,
} = require('../utils/emailService');

const router = express.Router();
const ALLOWED_NOTIFICATION_ROLES = ['planning_officer', 'technical_officer', 'superintendent', 'committee', 'admin'];

const protectNotificationsRoute = [
  authMiddleware,
  requireRole(ALLOWED_NOTIFICATION_ROLES),
];

const handleNotificationResult = (res, result, successMessage) => {
  if (result && result.success) {
    return res.json({
      success: true,
      message: successMessage,
      messageId: result.messageId,
    });
  }

  return sendError(res, 500, 'Failed to send notification', {
    code: 'NOTIFICATION_SEND_FAILED',
    details: result && result.error ? result.error : 'Unknown email service error',
  });
};

const withNotificationHandler = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('Notification route error:', error);
    return sendError(res, 500, 'Server error while sending notification', {
      code: 'NOTIFICATION_SERVER_ERROR',
      details: error.message,
    });
  }
};

const commonRequiredText = (fieldName) => (
  body(fieldName).trim().notEmpty().withMessage(`${fieldName} is required`)
);

/**
 * POST /api/notifications/send-to-sw
 * Send notification to Superintendent about TO report submission
 */
router.post(
  '/send-to-sw',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('swName'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('toOfficerName'),
  body('recommendation').optional().isIn(['approve', 'conditional-approval', 'reject']).withMessage('Invalid recommendation value'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, swName, applicantName, applicationId, toOfficerName, recommendation } = req.body;
    const result = await sendApplicationToSWNotification(email, swName, applicantName, applicationId, toOfficerName, recommendation);
    return handleNotificationResult(res, result, 'Notification sent to SW successfully');
  })
);

/**
 * POST /api/notifications/send-to-sw-by-application
 * Resolve active superintendent email(s) from DB and send TO report notification
 */
router.post(
  '/send-to-sw-by-application',
  protectNotificationsRoute,
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('toOfficerName'),
  body('recommendation').optional().isIn(['approve', 'conditional-approval', 'reject']).withMessage('Invalid recommendation value'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { applicantName, applicationId, toOfficerName, recommendation } = req.body;

    const swResult = await pool.query(
      `SELECT full_name, email
       FROM staff_accounts
       WHERE role = 'superintendent'
         AND is_active = TRUE
         AND email IS NOT NULL
         AND email <> ''
       ORDER BY id ASC
       LIMIT 1`
    );

    if (!swResult.rows.length) {
      return sendError(res, 404, 'No active Superintendent account with email was found', {
        code: 'SUPERINTENDENT_NOT_FOUND',
      });
    }

    const sw = swResult.rows[0];
    const result = await sendApplicationToSWNotification(
      sw.email,
      sw.full_name,
      applicantName,
      applicationId,
      toOfficerName,
      recommendation
    );

    return handleNotificationResult(res, result, 'Notification sent to SW successfully');
  })
);

/**
 * POST /api/notifications/send-to-committee
 * Send notification to Committee about SW endorsement
 */
router.post(
  '/send-to-committee',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('committeeName'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('swName'),
  body('swNotes').optional().isString().withMessage('swNotes must be a string'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, committeeName, applicantName, applicationId, swName, swNotes } = req.body;
    const result = await sendApplicationToCommitteeNotification(
      email,
      committeeName,
      applicantName,
      applicationId,
      swName,
      swNotes
    );
    return handleNotificationResult(res, result, 'Notification sent to Committee successfully');
  })
);

/**
 * POST /api/notifications/send-to-committee-by-application
 * Resolve active committee recipient from DB and send SW endorsement notification
 */
router.post(
  '/send-to-committee-by-application',
  protectNotificationsRoute,
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('swName'),
  body('swNotes').optional().isString().withMessage('swNotes must be a string'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { applicantName, applicationId, swName, swNotes } = req.body;

    const committeeResult = await pool.query(
      `SELECT full_name, email
       FROM staff_accounts
       WHERE role = 'committee'
         AND is_active = TRUE
         AND email IS NOT NULL
         AND email <> ''
       ORDER BY id ASC
       LIMIT 1`
    );

    if (!committeeResult.rows.length) {
      return sendError(res, 404, 'No active Committee account with email was found', {
        code: 'COMMITTEE_NOT_FOUND',
      });
    }

    const committee = committeeResult.rows[0];
    const result = await sendApplicationToCommitteeNotification(
      committee.email,
      committee.full_name,
      applicantName,
      applicationId,
      swName,
      swNotes || ''
    );

    return handleNotificationResult(res, result, 'Notification sent to Committee successfully');
  })
);

/**
 * POST /api/notifications/send-referral-to-to
 * Send notification to Technical Officer about SW referral
 */
router.post(
  '/send-referral-to-to',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('toName'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('swName'),
  commonRequiredText('referralReason'),
  body('referralType').isIn(['reinspection', 'report-correction', 'additional-information']).withMessage('Invalid referralType'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, toName, applicantName, applicationId, swName, referralReason, referralType } = req.body;
    const result = await sendApplicationReferralNotificationToTO(
      email,
      toName,
      applicantName,
      applicationId,
      swName,
      referralReason,
      referralType
    );
    return handleNotificationResult(res, result, 'Referral notification sent to TO successfully');
  })
);

/**
 * POST /api/notifications/send-referral-to-to-by-application
 * Resolve assigned technical officer recipient from DB and send SW referral notification
 */
router.post(
  '/send-referral-to-to-by-application',
  protectNotificationsRoute,
  body('applicationDbId').isInt({ min: 1 }).withMessage('Valid applicationDbId is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('swName'),
  commonRequiredText('referralReason'),
  body('referralType').isIn(['reinspection', 'report-correction', 'additional-information']).withMessage('Invalid referralType'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const {
      applicationDbId,
      applicantName,
      applicationId,
      swName,
      referralReason,
      referralType,
    } = req.body;

    const toResult = await pool.query(
      `SELECT sa.full_name, sa.email
       FROM application_assignments aa
       JOIN staff_accounts sa ON sa.id = aa.assigned_to
       WHERE aa.application_id = $1
         AND aa.status IN ('pending', 'accepted', 'in_progress')
         AND sa.role = 'technical_officer'
         AND sa.is_active = TRUE
         AND sa.email IS NOT NULL
         AND sa.email <> ''
       ORDER BY aa.assigned_at DESC, aa.id DESC
       LIMIT 1`,
      [Number(applicationDbId)]
    );

    if (!toResult.rows.length) {
      return sendError(res, 404, 'No active Technical Officer assignment with email was found', {
        code: 'TECHNICAL_OFFICER_NOT_FOUND',
      });
    }

    const toOfficer = toResult.rows[0];
    const result = await sendApplicationReferralNotificationToTO(
      toOfficer.email,
      toOfficer.full_name,
      applicantName,
      applicationId,
      swName,
      referralReason,
      referralType
    );

    return handleNotificationResult(res, result, 'Referral notification sent to TO successfully');
  })
);

/**
 * POST /api/notifications/send-applicant-approved
 * Send notification to applicant when committee approves
 */
router.post(
  '/send-applicant-approved',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('conditions').optional().isString().withMessage('conditions must be a string'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, conditions } = req.body;
    const result = await sendApplicantApprovalEmail(email, applicantName, applicationId, conditions || '');
    return handleNotificationResult(res, result, 'Approval notification sent to applicant successfully');
  })
);

/**
 * POST /api/notifications/send-applicant-corrections
 * Send notification to applicant when committee requests corrections
 */
router.post(
  '/send-applicant-corrections',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  commonRequiredText('correctionNote'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, correctionNote } = req.body;
    const result = await sendApplicantCorrectionsEmail(email, applicantName, applicationId, correctionNote);
    return handleNotificationResult(res, result, 'Corrections notification sent to applicant successfully');
  })
);

/**
 * POST /api/notifications/send-applicant-permit-collected
 * Send notification to applicant when permit is physically collected
 */
router.post(
  '/send-applicant-permit-collected',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('issuedAt').isISO8601().withMessage('issuedAt must be a valid ISO date'),
  body('issuedBy').optional().isString().withMessage('issuedBy must be a string'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, issuedAt, issuedBy } = req.body;
    const result = await sendApplicantPermitCollectedEmail(
      email,
      applicantName,
      applicationId,
      issuedAt,
      issuedBy || 'Planning Section Staff'
    );
    return handleNotificationResult(res, result, 'Permit collection notification sent to applicant successfully');
  })
);

router.post(
  '/send-permit-expiring-soon',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('expiryDate').isISO8601().withMessage('expiryDate must be a valid ISO date'),
  body('daysRemaining').isInt({ min: 0 }).withMessage('daysRemaining must be a non-negative integer'),
  body('currentYear').optional().isInt({ min: 1 }).withMessage('currentYear must be a positive integer'),
  body('maxYears').optional().isInt({ min: 1, max: 20 }).withMessage('maxYears must be between 1 and 20'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, expiryDate, daysRemaining, currentYear, maxYears } = req.body;
    const result = await sendPermitExpiringSoonEmail(
      email,
      applicantName,
      applicationId,
      expiryDate,
      Number(daysRemaining),
      Number(currentYear || 1),
      Number(maxYears || 5)
    );
    return handleNotificationResult(res, result, 'Permit expiring reminder sent');
  })
);

router.post(
  '/send-permit-expired',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('expiredDate').isISO8601().withMessage('expiredDate must be a valid ISO date'),
  body('canStillExtend').isBoolean().withMessage('canStillExtend must be boolean'),
  body('maxYears').optional().isInt({ min: 1, max: 20 }).withMessage('maxYears must be between 1 and 20'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, expiredDate, canStillExtend, maxYears } = req.body;
    const result = await sendPermitExpiredEmail(
      email,
      applicantName,
      applicationId,
      expiredDate,
      Boolean(canStillExtend),
      Number(maxYears || 5)
    );
    return handleNotificationResult(res, result, 'Permit expired notice sent');
  })
);

router.post(
  '/send-applicant-inspection-scheduled',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('scheduledAt').isISO8601().withMessage('scheduledAt must be a valid ISO date'),
  body('technicalOfficerName').optional().isString().withMessage('technicalOfficerName must be a string'),
  body('technicalOfficerContact').optional().isString().withMessage('technicalOfficerContact must be a string'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const {
      email,
      applicantName,
      applicationId,
      scheduledAt,
      technicalOfficerName,
      technicalOfficerContact,
    } = req.body;

    const result = await sendApplicantInspectionScheduledEmail(
      email,
      applicantName,
      applicationId,
      scheduledAt,
      technicalOfficerName || 'Technical Officer',
      technicalOfficerContact || ''
    );

    return handleNotificationResult(res, result, 'Inspection schedule notification sent to applicant successfully');
  })
);

router.post(
  '/send-permit-extended',
  protectNotificationsRoute,
  body('email').trim().isEmail().withMessage('Valid email is required'),
  commonRequiredText('applicantName'),
  commonRequiredText('applicationId'),
  body('previousExpiry').isISO8601().withMessage('previousExpiry must be a valid ISO date'),
  body('newExpiry').isISO8601().withMessage('newExpiry must be a valid ISO date'),
  body('currentYear').isInt({ min: 1 }).withMessage('currentYear must be a positive integer'),
  body('maxYears').optional().isInt({ min: 1, max: 20 }).withMessage('maxYears must be between 1 and 20'),
  validateRequest,
  withNotificationHandler(async (req, res) => {
    const { email, applicantName, applicationId, previousExpiry, newExpiry, currentYear, maxYears } = req.body;
    const result = await sendPermitExtendedEmail(
      email,
      applicantName,
      applicationId,
      previousExpiry,
      newExpiry,
      Number(currentYear),
      Number(maxYears || 5)
    );
    return handleNotificationResult(res, result, 'Permit extension confirmation sent');
  })
);

module.exports = router;
