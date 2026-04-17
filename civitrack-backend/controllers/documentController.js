const multer = require('multer');
const pool = require('../config/db');
const {
  TEMP_DOCUMENTS_ROOT,
  createSafeUploadFilename,
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
  getDocumentFilePath,
} = require('../utils/documentStorage');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DOCUMENTS_ROOT);
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

/**
 * Upload document for application
 * POST /api/documents/upload
 */
exports.uploadDocument = [
  upload.single('file'),
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

module.exports = {
  upload,
  uploadDocument: exports.uploadDocument,
  getApplicationDocuments: exports.getApplicationDocuments,
  deleteDocument: exports.deleteDocument,
  downloadDocument: exports.downloadDocument,
};
