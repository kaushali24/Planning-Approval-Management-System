const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const adminAuthMiddleware = require('../middleware/adminAuth');

const router = express.Router();

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/verify-email', authController.verifyEmail);
router.post('/resend-verification-code', authController.resendVerificationCode);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-token', authController.verifyResetToken);
router.post('/reset-password', authController.resetPassword);

// Protected routes (authenticated users)
router.get('/me', authMiddleware, authController.getCurrentUser);
router.patch('/profile', authMiddleware, authController.updateProfile);
router.post('/change-password', authMiddleware, authController.changePassword);

// Admin-only routes
router.post('/admin/reset-staff-password', adminAuthMiddleware, authController.resetStaffPassword);

module.exports = router;
