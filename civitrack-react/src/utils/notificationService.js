/**
 * Frontend utility to trigger email notifications through the backend API
 */
import { API_BASE_URL } from './apiBase';

const NOTIFICATIONS_API_BASE = `${API_BASE_URL}/api/notifications`;

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const requestNotification = async (endpoint, body) => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return { success: false, error: 'Authentication token is missing', code: 'AUTH_REQUIRED' };
    }

    const response = await fetch(`${NOTIFICATIONS_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await parseJsonSafe(response);
    return {
      success: Boolean(response.ok && data?.success !== false),
      status: response.status,
      message: data?.message,
      messageId: data?.messageId,
      warning: data?.warning,
      code: data?.code,
      error: data?.error?.message || data?.error || data?.message,
      raw: data,
    };
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to Superintendent about TO report submission
 * Called when TO completes report submission
 */
export const notifySupIntendentAboutTOReport = async (swEmail, swName, applicantName, applicationId, toOfficerName, recommendation) => {
  return requestNotification('/send-to-sw', {
    email: swEmail,
    swName,
    applicantName,
    applicationId,
    toOfficerName,
    recommendation,
  });
};

/**
 * Send notification to Committee about SW endorsement
 * Called when SW endorses application to Committee
 */
export const notifyCommitteeAboutSWEndorsement = async (committeeEmail, committeeName, applicantName, applicationId, swName, swNotes) => {
  return requestNotification('/send-to-committee', {
    email: committeeEmail,
    committeeName,
    applicantName,
    applicationId,
    swName,
    swNotes,
  });
};

/**
 * Send notification to Technical Officer about SW referral
 * Called when SW refers application back to TO for revision
 */
export const notifyTOAboutSWReferral = async (toEmail, toName, applicantName, applicationId, swName, referralReason, referralType) => {
  return requestNotification('/send-referral-to-to', {
    email: toEmail,
    toName,
    applicantName,
    applicationId,
    swName,
    referralReason,
    referralType,
  });
};

/**
 * Send notification to applicant after committee approval
 */
export const notifyApplicantCommitteeApproval = async (email, applicantName, applicationId, conditions = '') => {
  return requestNotification('/send-applicant-approved', {
    email,
    applicantName,
    applicationId,
    conditions,
  });
};

/**
 * Send notification to applicant after committee correction request
 */
export const notifyApplicantCommitteeCorrections = async (email, applicantName, applicationId, correctionNote) => {
  return requestNotification('/send-applicant-corrections', {
    email,
    applicantName,
    applicationId,
    correctionNote,
  });
};

/**
 * Send notification to applicant after permit is physically collected
 */
export const notifyApplicantPermitCollected = async (email, applicantName, applicationId, issuedAt, issuedBy) => {
  return requestNotification('/send-applicant-permit-collected', {
    email,
    applicantName,
    applicationId,
    issuedAt,
    issuedBy,
  });
};

export const notifyPermitExpiringSoon = async (email, applicantName, applicationId, expiryDate, daysRemaining, currentYear = 1, maxYears = 5) => {
  return requestNotification('/send-permit-expiring-soon', {
    email,
    applicantName,
    applicationId,
    expiryDate,
    daysRemaining,
    currentYear,
    maxYears,
  });
};

export const notifyPermitExpired = async (email, applicantName, applicationId, expiredDate, canStillExtend, maxYears = 5) => {
  return requestNotification('/send-permit-expired', {
    email,
    applicantName,
    applicationId,
    expiredDate,
    canStillExtend,
    maxYears,
  });
};

export const notifyPermitExtended = async (email, applicantName, applicationId, previousExpiry, newExpiry, currentYear, maxYears = 5) => {
  return requestNotification('/send-permit-extended', {
    email,
    applicantName,
    applicationId,
    previousExpiry,
    newExpiry,
    currentYear,
    maxYears,
  });
};

/**
 * Batch send notifications with error handling
 * Returns array of results for each notification attempt
 */
export const sendBatchNotifications = async (notifications) => {
  const results = await Promise.all(
    notifications.map(async (notif) => {
      try {
        let result;
        if (notif.type === 'to-sw') {
          result = await notifySupIntendentAboutTOReport(
            notif.swEmail,
            notif.swName,
            notif.applicantName,
            notif.applicationId,
            notif.toOfficerName,
            notif.recommendation
          );
        } else if (notif.type === 'sw-committee') {
          result = await notifyCommitteeAboutSWEndorsement(
            notif.committeeEmail,
            notif.committeeName,
            notif.applicantName,
            notif.applicationId,
            notif.swName,
            notif.swNotes
          );
        } else if (notif.type === 'sw-to-referral') {
          result = await notifyTOAboutSWReferral(
            notif.toEmail,
            notif.toName,
            notif.applicantName,
            notif.applicationId,
            notif.swName,
            notif.referralReason,
            notif.referralType
          );
        } else if (notif.type === 'committee-applicant-approved') {
          result = await notifyApplicantCommitteeApproval(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.conditions
          );
        } else if (notif.type === 'committee-applicant-corrections') {
          result = await notifyApplicantCommitteeCorrections(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.correctionNote
          );
        } else if (notif.type === 'permit-collected-applicant') {
          result = await notifyApplicantPermitCollected(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.issuedAt,
            notif.issuedBy
          );
        } else if (notif.type === 'permit-expiring-soon') {
          result = await notifyPermitExpiringSoon(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.expiryDate,
            notif.daysRemaining,
            notif.currentYear,
            notif.maxYears
          );
        } else if (notif.type === 'permit-expired') {
          result = await notifyPermitExpired(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.expiredDate,
            notif.canStillExtend,
            notif.maxYears
          );
        } else if (notif.type === 'permit-extended') {
          result = await notifyPermitExtended(
            notif.email,
            notif.applicantName,
            notif.applicationId,
            notif.previousExpiry,
            notif.newExpiry,
            notif.currentYear,
            notif.maxYears
          );
        }
        return { type: notif.type, ...result };
      } catch (error) {
        return { type: notif.type, success: false, error: error.message };
      }
    })
  );

  return results;
};
