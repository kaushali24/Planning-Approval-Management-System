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

module.exports = {
  generateOTP,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
