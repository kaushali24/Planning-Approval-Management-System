const nodemailer = require('nodemailer');

// Create transporter with Gmail SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD, // App Password from Gmail
    },
  });
};

/**
 * Generate 6-digit OTP code
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP verification email
 */
const sendVerificationEmail = async (email, fullName, otp) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Email Verification - CiviTrack',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Email Verification</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>Thank you for registering with CiviTrack - Kelaniya Pradeshiya Sabha's Planning Application Portal.</p>
            <p>To complete your registration, please use the following One-Time Password (OTP) to verify your email address:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p style="margin: 10px 0 0 0; color: #6b7280;">Valid for 15 minutes</p>
            </div>

            <div class="warning">
              <strong>Security Notice:</strong> Never share this OTP with anyone. CiviTrack staff will never ask for your OTP.
            </div>

            <p>If you did not create an account, please ignore this email or contact our support team.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>CiviTrack Team</strong><br>
            Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2026 Kelaniya Pradeshiya Sabha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${fullName},

Thank you for registering with CiviTrack - Kelaniya Pradeshiya Sabha's Planning Application Portal.

Your email verification OTP is: ${otp}

This code is valid for 15 minutes.

Security Notice: Never share this OTP with anyone. CiviTrack staff will never ask for your OTP.

If you did not create an account, please ignore this email.

Best regards,
CiviTrack Team
Kelaniya Pradeshiya Sabha
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send password reset OTP email
 */
const sendPasswordResetEmail = async (email, fullName, otp) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Password Reset - CiviTrack',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .otp-box { background: white; border: 2px dashed #dc2626; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .otp-code { font-size: 32px; font-weight: bold; color: #dc2626; letter-spacing: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .warning { background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${fullName}</strong>,</p>
            <p>We received a request to reset your password for your CiviTrack account.</p>
            <p>Use the following OTP to reset your password:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p style="margin: 10px 0 0 0; color: #6b7280;">Valid for 15 minutes</p>
            </div>

            <div class="warning">
              <strong>Security Alert:</strong> If you did not request a password reset, please ignore this email and ensure your account is secure.
            </div>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>CiviTrack Team</strong><br>
            Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2026 Kelaniya Pradeshiya Sabha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to Superintendent about TO report submission
 */
const sendApplicationToSWNotification = async (email, swName, applicantName, applicationId, toOfficerName, recommendation) => {
  const transporter = createTransporter();

  const recommendationLabel = recommendation === 'approve' ? '✓ Approve' : recommendation === 'reject' ? '✗ Reject' : 'Conditional Approval';

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Application Ready for Endorsement Review - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; border-left: 4px solid #3b82f6; border-radius: 4px; padding: 15px; margin: 15px 0; }
          .recommendation { background: white; border-radius: 4px; padding: 15px; margin: 15px 0; border: 1px solid #e5e7eb; }
          .rec-label { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
          .rec-approve { background: #dcfce7; color: #166534; }
          .rec-conditional { background: #fef3c7; color: #92400e; }
          .rec-reject { background: #fee2e2; color: #991b1b; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
          .action-link { background: #3b82f6; color: white; padding: 12px 24px; border-radius: 4px; text-decoration: none; display: inline-block; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Stage 6: Application Ready for Review</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${swName}</strong>,</p>
            <p>A new application is ready for your endorsed review.</p>
            
            <div class="info-box">
              <p><strong>Application ID:</strong> ${applicationId}</p>
              <p><strong>Applicant Name:</strong> ${applicantName}</p>
              <p><strong>Submitted by:</strong> ${toOfficerName} (Technical Officer)</p>
            </div>

            <div class="recommendation">
              <p><strong>Technical Officer Recommendation:</strong></p>
              <p><span class="rec-label ${recommendation === 'approve' ? 'rec-approve' : recommendation === 'conditional-approval' ? 'rec-conditional' : 'rec-reject'}">${recommendationLabel}</span></p>
            </div>

            <p>Please review the complete application package including:</p>
            <ul>
              <li>Technical Officer's inspection report</li>
              <li>Submitted documents</li>
              <li>Payment records</li>
              <li>Application history</li>
            </ul>

            <p>You can then endorse to the Committee or refer back to Technical Officer for corrections.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>CiviTrack System</strong><br>
            Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2026 Kelaniya Pradeshiya Sabha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${swName},

A new application is ready for your endorsed review.

Application ID: ${applicationId}
Applicant Name: ${applicantName}
Submitted by: ${toOfficerName} (Technical Officer)

Technical Officer Recommendation: ${recommendationLabel}

Please review the complete application package including:
- Technical Officer's inspection report
- Submitted documents
- Payment records
- Application history

You can then endorse to the Committee or refer back to Technical Officer for corrections.

Best regards,
CiviTrack System
Kelaniya Pradeshiya Sabha
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Application to SW review notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to Committee about SW endorsement
 */
const sendApplicationToCommitteeNotification = async (email, committeeName, applicantName, applicationId, swName, swNotes) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Application Endorsed for Final Approval - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; border-left: 4px solid #10b981; border-radius: 4px; padding: 15px; margin: 15px 0; }
          .notes-box { background: white; border-radius: 4px; padding: 15px; margin: 15px 0; border: 1px solid #e5e7eb; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Ready for Final Approval</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${committeeName}</strong>,</p>
            <p>An application has been endorsed by the Superintendent and is ready for your final approval decision.</p>
            
            <div class="info-box">
              <p><strong>Application ID:</strong> ${applicationId}</p>
              <p><strong>Applicant Name:</strong> ${applicantName}</p>
              <p><strong>Endorsed by:</strong> ${swName} (Superintendent)</p>
            </div>

            <div class="notes-box">
              <p><strong>Superintendent's Notes:</strong></p>
              <p>${swNotes || 'No additional notes provided.'}</p>
            </div>

            <p>The complete application package is available in the system for your review, including:</p>
            <ul>
              <li>Full application details</li>
              <li>Technical Officer's report</li>
              <li>Superintendent's endorsement</li>
              <li>All supporting documents</li>
            </ul>

            <p>Please review and make a final decision within the designated timeframe.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>CiviTrack System</strong><br>
            Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2026 Kelaniya Pradeshiya Sabha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${committeeName},

An application has been endorsed by the Superintendent and is ready for your final approval decision.

Application ID: ${applicationId}
Applicant Name: ${applicantName}
Endorsed by: ${swName} (Superintendent)

Superintendent's Notes:
${swNotes || 'No additional notes provided.'}

The complete application package is available in the system for your review.

Please review and make a final decision within the designated timeframe.

Best regards,
CiviTrack System
Kelaniya Pradeshiya Sabha
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Application to Committee notification sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to Technical Officer about SW referral
 */
const sendApplicationReferralNotificationToTO = async (email, toName, applicantName, applicationId, swName, referralReason, referralType) => {
  const transporter = createTransporter();

  const referralTypeLabels = {
    'reinspection': 'Site Reinspection Required',
    'report-correction': 'Report Correction Required',
    'additional-information': 'Additional Information Required',
  };

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Application Referred Back for Revision - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 15px; margin: 15px 0; }
          .reason-box { background: #fef3c7; border-radius: 4px; padding: 15px; margin: 15px 0; border-left: 4px solid #f59e0b; }
          .type-badge { background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Referred Back</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${toName}</strong>,</p>
            <p>Your submitted report for an application has been reviewed by the Superintendent and referred back for revision.</p>
            
            <div class="info-box">
              <p><strong>Application ID:</strong> ${applicationId}</p>
              <p><strong>Applicant Name:</strong> ${applicantName}</p>
              <p><strong>Referred by:</strong> ${swName} (Superintendent)</p>
            </div>

            <div style="margin: 15px 0;">
              <p><strong>Revision Type:</strong></p>
              <p><span class="type-badge">${referralTypeLabels[referralType] || referralType}</span></p>
            </div>

            <div class="reason-box">
              <p><strong>Reason for Referral:</strong></p>
              <p>${referralReason}</p>
            </div>

            <p>Please address these issues and resubmit your report. You can access the full application details and your previous report from the system to make the necessary revisions.</p>

            <p><strong>Action Required:</strong> Open the application from your dashboard and click "Revise Report" to update your submission.</p>
            
            <p style="margin-top: 30px;">Best regards,<br>
            <strong>CiviTrack System</strong><br>
            Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; 2026 Kelaniya Pradeshiya Sabha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${toName},

Your submitted report for an application has been reviewed by the Superintendent and referred back for revision.

Application ID: ${applicationId}
Applicant Name: ${applicantName}
Referred by: ${swName} (Superintendent)

Revision Type: ${referralTypeLabels[referralType] || referralType}

Reason for Referral:
${referralReason}

Please address these issues and resubmit your report. You can access the full application details and your previous report from the system to make the necessary revisions.

Action Required: Open the application from your dashboard and click "Revise Report" to update your submission.

Best regards,
CiviTrack System
Kelaniya Pradeshiya Sabha
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Referral notification to TO sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to applicant when committee approves application
 */
const sendApplicantApprovalEmail = async (email, applicantName, applicationId, conditions = '') => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Application Approved - Action Required',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 640px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 28px; border-radius: 0 0 10px 10px; }
          .box { background: white; border-left: 4px solid #16a34a; padding: 14px; border-radius: 4px; margin: 12px 0; }
          .list { background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application Approved</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${applicantName}</strong>,</p>
            <p>Congratulations! Your application <strong>[REF: ${applicationId}]</strong> has been approved by the Planning Committee.</p>

            <div class="box">
              <p><strong>Status:</strong> Approved by Planning Committee</p>
              ${conditions ? `<p><strong>Committee Conditions:</strong> ${conditions}</p>` : ''}
            </div>

            <p>To collect your official stamped permit, please visit the Kelaniya Pradeshiya Sabha Planning Section with the following original documents:</p>
            <div class="list">
              <ul>
                <li>Original Deed</li>
                <li>Original Approved Plans (all sheets)</li>
                <li>Original External Clearance Documents (if applicable)</li>
                <li>National Identity Card (original)</li>
                <li>2 recent passport-size photographs</li>
              </ul>
            </div>

            <p><strong>Location:</strong> Kelaniya Pradeshiya Sabha - Planning Section<br>
            <strong>Working Hours:</strong> Monday-Friday, 8:30 AM - 4:00 PM<br>
            <strong>Contact:</strong> 011 2914110</p>

            <div class="box" style="border-left-color:#2563eb;">
              <p><strong>Important Notes:</strong></p>
              <ul>
                <li>Permit is issued only after verification of original documents.</li>
                <li>Bring all documents in a file for easy processing.</li>
                <li>Processing time is approximately 30 minutes on the day of visit.</li>
              </ul>
            </div>

            <p>Congratulations again on your approval.</p>

            <p style="margin-top: 24px;">Best regards,<br><strong>Kelaniya Pradeshiya Sabha</strong><br>Planning Section</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${applicantName},

  Congratulations! Your application [REF: ${applicationId}] has been approved by the Planning Committee.

  Status: Approved by Planning Committee
${conditions ? `Committee Conditions: ${conditions}` : ''}

  To collect your official stamped permit, please visit the Kelaniya Pradeshiya Sabha Planning Section with the following original documents:
  - Original Deed
  - Original Approved Plans (all sheets)
  - Original External Clearance Documents (if applicable)
  - National Identity Card (original)
  - 2 recent passport-size photographs

  Location: Kelaniya Pradeshiya Sabha - Planning Section
  Working Hours: Monday-Friday, 8:30 AM - 4:00 PM
Contact: 011 2914110

  Important Notes:
  - Permit is issued only after verification of original documents.
  - Bring all documents in a file for easy processing.
  - Processing time is approximately 30 minutes on the day of visit.

  Congratulations again on your approval.

Best regards,
  Kelaniya Pradeshiya Sabha
  Planning Section
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Applicant approval email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to applicant after permit is physically issued/collected
 */
const sendApplicantPermitCollectedEmail = async (email, applicantName, applicationId, issuedAt, issuedBy = 'Planning Section Staff') => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Permit Collection Confirmed - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 640px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 28px; border-radius: 0 0 10px 10px; }
          .box { background: white; border-left: 4px solid #0ea5e9; padding: 14px; border-radius: 4px; margin: 12px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Permit Collection Confirmed</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${applicantName}</strong>,</p>
            <p>Your permit has been issued and physically collected successfully.</p>

            <div class="box">
              <p><strong>Reference Number:</strong> ${applicationId}</p>
              <p><strong>Collected At:</strong> ${new Date(issuedAt).toLocaleString()}</p>
              <p><strong>Issued By:</strong> ${issuedBy}</p>
              <p><strong>Status:</strong> Permit Collected</p>
            </div>

            <p>Please keep your permit document safely and ensure compliance with all conditions stated on the permit.</p>

            <p style="margin-top: 24px;">Best regards,<br><strong>Kelaniya Pradeshiya Sabha</strong><br>Planning Section</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${applicantName},

Your permit has been issued and physically collected successfully.

Reference Number: ${applicationId}
Collected At: ${new Date(issuedAt).toLocaleString()}
Issued By: ${issuedBy}
Status: Permit Collected

Please keep your permit document safely and ensure compliance with all conditions stated on the permit.

Best regards,
Kelaniya Pradeshiya Sabha
Planning Section
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Applicant permit collection email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

const sendPermitExpiringSoonEmail = async (email, applicantName, applicationId, expiryDate, daysRemaining, currentYear = 1, maxYears = 5) => {
  const transporter = createTransporter();
  const urgent = Number(daysRemaining) <= 7;
  const subject = urgent
    ? 'URGENT - Permit Expires in 7 Days'
    : 'Permit Expiring Soon - Action Required';

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text: `
Dear ${applicantName},

Your building permit [REF: ${applicationId}] will expire on ${expiryDate} (${daysRemaining} day(s) from now).

To extend your permit:
1. Log in to your dashboard
2. Click "Extend Permit"
3. Pay extension fee: Rs. 5,000
4. Permit will be extended for 1 additional year

Maximum extensions: ${maxYears} years total
Current: Year ${currentYear} of ${maxYears}

Extend now to avoid permit expiry.

Kelaniya Pradeshiya Sabha
Planning Section
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendPermitExpiredEmail = async (email, applicantName, applicationId, expiredDate, canStillExtend, maxYears = 5) => {
  const transporter = createTransporter();
  const optionsText = canStillExtend
    ? `1. You can still extend (pay Rs. 5,000)\n2. Log in to dashboard and click "Extend"`
    : `1. Extension not possible\n2. Must start NEW application\n3. Full approval process required`;

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Permit Expired',
    text: `
Dear ${applicantName},

Your permit [REF: ${applicationId}] has expired.

Status: Expired (as of ${expiredDate})

Options:
${optionsText}

Maximum validity period: ${maxYears} years total.

Kelaniya Pradeshiya Sabha
Planning Section
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendPermitExtendedEmail = async (email, applicantName, applicationId, previousExpiry, newExpiry, currentYear, maxYears = 5) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Permit Extended - ${applicationId}`,
    text: `
Dear ${applicantName},

Your building permit has been extended successfully.

Reference: ${applicationId}
Previous Expiry: ${previousExpiry}
New Expiry: ${newExpiry}
Extension Fee: Rs. 5,000.00
Current Validity: Year ${currentYear} of ${maxYears}

Kelaniya Pradeshiya Sabha
Planning Section
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to applicant when committee requests corrections
 */
const sendApplicantCorrectionsEmail = async (email, applicantName, applicationId, correctionNote) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Corrections Required - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 640px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 28px; border-radius: 0 0 10px 10px; }
          .box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 14px; border-radius: 4px; margin: 12px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Corrections Requested</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${applicantName}</strong>,</p>
            <p>Your application <strong>${applicationId}</strong> was reviewed by the Planning Committee and requires corrections before approval.</p>

            <div class="box">
              <p><strong>Committee Review Note:</strong></p>
              <p>${correctionNote}</p>
            </div>

            <p>Please review the note on your applicant dashboard and use the <strong>Submit Appeal</strong> option after completing the required corrections.</p>

            <p style="margin-top: 24px;">Best regards,<br><strong>CiviTrack System</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${applicantName},

Your application ${applicationId} was reviewed by the Planning Committee and requires corrections before approval.

Committee Review Note:
${correctionNote}

Please review the note on your applicant dashboard and use the Submit Appeal option after completing the required corrections.

Best regards,
CiviTrack System
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Applicant corrections email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send notification to applicant when TO schedules site inspection
 */
const sendApplicantInspectionScheduledEmail = async (
  email,
  applicantName,
  applicationId,
  scheduledAt,
  technicalOfficerName,
  technicalOfficerContact = ''
) => {
  const transporter = createTransporter();
  const scheduledDisplay = new Date(scheduledAt).toLocaleString();

  const mailOptions = {
    from: `"CiviTrack - Kelaniya Pradeshiya Sabha" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Inspection Scheduled - ${applicationId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 640px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 28px; border-radius: 0 0 10px 10px; }
          .box { background: white; border-left: 4px solid #0f766e; padding: 14px; border-radius: 4px; margin: 12px 0; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Inspection Appointment Confirmed</h1>
          </div>
          <div class="content">
            <p>Dear <strong>${applicantName}</strong>,</p>
            <p>Your site inspection appointment has been scheduled and recorded in CiviTrack.</p>

            <div class="box">
              <p><strong>Application Reference:</strong> ${applicationId}</p>
              <p><strong>Scheduled Date and Time:</strong> ${scheduledDisplay}</p>
              <p><strong>Technical Officer:</strong> ${technicalOfficerName || 'Technical Officer'}</p>
              ${technicalOfficerContact ? `<p><strong>Contact Number:</strong> ${technicalOfficerContact}</p>` : ''}
            </div>

            <p>If you need to coordinate any change, please contact the Technical Officer directly.</p>

            <p style="margin-top: 24px;">Best regards,<br><strong>CiviTrack System</strong><br>Kelaniya Pradeshiya Sabha</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${applicantName},

Your site inspection appointment has been scheduled and recorded in CiviTrack.

Application Reference: ${applicationId}
Scheduled Date and Time: ${scheduledDisplay}
Technical Officer: ${technicalOfficerName || 'Technical Officer'}
${technicalOfficerContact ? `Contact Number: ${technicalOfficerContact}` : ''}

If you need to coordinate any change, please contact the Technical Officer directly.

Best regards,
CiviTrack System
Kelaniya Pradeshiya Sabha
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Applicant inspection scheduled email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendVerificationEmail,
  sendPasswordResetEmail,
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
};
