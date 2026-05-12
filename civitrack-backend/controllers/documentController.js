const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const pool = require('../config/db');
const {
  TEMP_DOCUMENTS_ROOT,
  createSafeUploadFilename,
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
  getDocumentFilePath,
  ensureTempDocumentsRoot,
} = require('../utils/documentStorage');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureTempDocumentsRoot();
      cb(null, TEMP_DOCUMENTS_ROOT);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    cb(null, createSafeUploadFilename(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const getFilesFromRequest = (req) => {
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') return Object.values(req.files).flat();
  if (req.file) return [req.file];
  return [];
};

const startsWithSignature = (buffer, signature) => signature.every((byte, index) => buffer[index] === byte);

const hasValidMagicBytes = (buffer, mimetype) => {
  // PDF
  if (mimetype === 'application/pdf') {
    return startsWithSignature(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
  }
  // JPEG
  if (mimetype === 'image/jpeg') {
    return startsWithSignature(buffer, [0xff, 0xd8, 0xff]);
  }
  // PNG
  if (mimetype === 'image/png') {
    return startsWithSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  // Legacy Office (DOC/XLS - OLE)
  if (mimetype === 'application/msword' || mimetype === 'application/vnd.ms-excel') {
    return startsWithSignature(buffer, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  // Modern Office (DOCX/XLSX - ZIP container)
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return startsWithSignature(buffer, [0x50, 0x4b, 0x03, 0x04]);
  }
  return false;
};

const validateFileSignature = async (file) => {
  const handle = await fs.open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, 16, 0);
    return hasValidMagicBytes(buffer, file.mimetype);
  } finally {
    await handle.close();
  }
};

const enforceMagicByteValidation = async (req, res, next) => {
  try {
    const files = getFilesFromRequest(req);
    for (const file of files) {
      const valid = await validateFileSignature(file);
      if (!valid) {
        await Promise.all(
          files.map((f) => removeFileIfExists(f.path).catch(() => {}))
        );
        return res.status(400).json({
          error: `Uploaded file content does not match declared type for ${file.originalname || file.filename}`,
          code: 'INVALID_FILE_SIGNATURE',
        });
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Upload document for application
 * POST /api/documents/upload
 */
exports.uploadDocument = [
  upload.single('file'),
  enforceMagicByteValidation,
  async (req, res) => {
    let storedFilePath = null;
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const { application_id, doc_type } = req.body;
      const user = req.user;

      // Verify application exists
      const appResult = await pool.query(
        `SELECT a.id, a.applicant_id, a.application_code, ap.applicant_ref_id
         FROM applications a
         JOIN applicants ap ON ap.id = a.applicant_id
         WHERE a.id = $1`,
        [application_id]
      );

      if (!appResult.rows.length) {
        await removeFileIfExists(req.file.path);
        return res.status(404).json({ error: 'Application not found' });
      }

      const app = appResult.rows[0];

      // Check authorization
      if ((user.accountType === 'applicant' || user.role === 'applicant') && app.applicant_id !== user.userId) {
        await removeFileIfExists(req.file.path);
        return res.status(403).json({ error: 'You can only upload documents for your own applications' });
      }

      const documentCategory = String(doc_type || '').trim().toLowerCase().replace(/\s+/g, '_') || 'document';
      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: app.applicant_ref_id,
        applicationCode: app.application_code,
        documentCategory,
        filename: req.file.filename,
      });

      await moveUploadedFile(req.file.path, storageInfo.absolutePath);
      storedFilePath = storageInfo.absolutePath;

      // Insert document record
      const result = await pool.query(
        `INSERT INTO documents (
          application_id,
          applicant_ref_id,
          application_code,
          doc_type,
          document_category,
          original_filename,
          stored_filename,
          storage_key,
          file_url,
          mime_type,
          file_size
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, application_id, applicant_ref_id, application_code, doc_type, document_category, original_filename, stored_filename, storage_key, file_url, uploaded_at`,
        [
          application_id,
          app.applicant_ref_id,
          app.application_code,
          doc_type,
          documentCategory,
          req.file.originalname,
          req.file.filename,
          storageInfo.relativePath,
          storageInfo.relativePath,
          req.file.mimetype,
          req.file.size,
        ]
      );

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: result.rows[0],
      });
    } catch (error) {
      if (storedFilePath) {
        await removeFileIfExists(storedFilePath).catch((cleanupError) => {
          console.error('Persisted upload cleanup error:', cleanupError);
        });
      }
      if (req.file?.path) {
        await removeFileIfExists(req.file.path).catch((cleanupError) => {
          console.error('Temporary upload cleanup error:', cleanupError);
        });
      }
      console.error('Upload document error:', error);
      res.status(500).json({ error: 'Failed to upload document', details: error.message });
    }
  },
];

/**
 * Get documents for application
 * GET /api/documents/application/:id
 */
exports.getApplicationDocuments = async (req, res) => {
  try {
    const { id: applicationId } = req.params;
    const user = req.user;

    // Verify application exists and user has access
    const appResult = await pool.query(
      'SELECT applicant_id FROM applications WHERE id = $1',
      [applicationId]
    );

    if (!appResult.rows.length) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if ((user.accountType === 'applicant' || user.role === 'applicant') && appResult.rows[0].applicant_id !== user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get documents
    const result = await pool.query(
      `SELECT 
        id, application_id, applicant_ref_id, application_code, doc_type, document_category,
        original_filename, stored_filename, storage_key, COALESCE(storage_key, file_url) AS file_url, uploaded_at
       FROM documents
       WHERE application_id = $1
       ORDER BY uploaded_at DESC`,
      [applicationId]
    );

    res.json({
      documents: result.rows,
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to fetch documents', details: error.message });
  }
};

/**
 * Delete document
 * DELETE /api/documents/:id
 */
exports.deleteDocument = async (req, res) => {
  try {
    const { id: documentId } = req.params;
    const user = req.user;

    // Get document
    const docResult = await pool.query(
      `SELECT d.*, a.applicant_id 
       FROM documents d
       JOIN applications a ON d.application_id = a.id
       WHERE d.id = $1`,
      [documentId]
    );

    if (!docResult.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check authorization
    if ((user.accountType === 'applicant' || user.role === 'applicant') && doc.applicant_id !== user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from file system
    const filePath = getDocumentFilePath(doc);
    await removeFileIfExists(filePath);

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document', details: error.message });
  }
};

/**
 * Download document
 * GET /api/documents/:id/download
 */
exports.downloadDocument = async (req, res) => {
  try {
    const { id: documentId } = req.params;
    const user = req.user;

    // Get document
    const docResult = await pool.query(
      `SELECT d.*, a.applicant_id 
       FROM documents d
       JOIN applications a ON d.application_id = a.id
       WHERE d.id = $1`,
      [documentId]
    );

    if (!docResult.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check authorization
    if ((user.accountType === 'applicant' || user.role === 'applicant') && doc.applicant_id !== user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Send file
    const filePath = getDocumentFilePath(doc);
    res.download(filePath);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document', details: error.message });
  }
};

/**
 * Serve uploaded document by storage path with auth checks.
 * GET /uploads/*
 */
exports.getProtectedUpload = async (req, res) => {
  try {
    const user = req.user || {};
    const rawStoragePath = String(req.params[0] || '').trim();
    if (!rawStoragePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const normalizedPath = path.posix.normalize(rawStoragePath);
    if (normalizedPath.startsWith('..') || normalizedPath.includes('\\')) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const docResult = await pool.query(
      `SELECT d.*, a.applicant_id
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       WHERE d.storage_key = $1 OR d.file_url = $1
       ORDER BY d.id DESC
       LIMIT 1`,
      [normalizedPath]
    );

    if (!docResult.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];
    if ((user.accountType === 'applicant' || user.role === 'applicant') && Number(doc.applicant_id) !== Number(user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = getDocumentFilePath(doc);
    try {
      await fs.access(filePath);
    } catch (_error) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    return res.sendFile(filePath);
  } catch (error) {
    console.error('Protected upload access error:', error);
    return res.status(500).json({ error: 'Failed to access file', details: error.message });
  }
};

module.exports = {
  upload,
  enforceMagicByteValidation,
  uploadDocument: exports.uploadDocument,
  getApplicationDocuments: exports.getApplicationDocuments,
  deleteDocument: exports.deleteDocument,
  downloadDocument: exports.downloadDocument,
  getProtectedUpload: exports.getProtectedUpload,
};
