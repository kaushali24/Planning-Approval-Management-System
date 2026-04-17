const express = require('express');
const { param, body } = require('express-validator');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middleware/auth');
const { validateRequest, sendError } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * POST /api/documents/upload
 * Upload document for application
 */
router.post(
  '/upload',
  authMiddleware,
  [
    body('application_id').isInt({ min: 1 }).withMessage('Invalid application ID'),
    body('doc_type').notEmpty().withMessage('Document type is required'),
    validateRequest,
  ],
  documentController.uploadDocument
);

/**
 * GET /api/documents/application/:id
 * Get all documents for an application
 */
router.get(
  '/application/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  documentController.getApplicationDocuments
);

/**
 * GET /api/documents/:id/download
 * Download a document
 */
router.get(
  '/:id/download',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  documentController.downloadDocument
);

/**
 * DELETE /api/documents/:id
 * Delete a document
 */
router.delete(
  '/:id',
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validateRequest,
  documentController.deleteDocument
);

/**
 * Error handling
 */
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
