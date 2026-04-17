const fs = require('fs');
const path = require('path');
const pool = require('./config/db');
const {
  buildDocumentStorageInfo,
  moveUploadedFile,
  getDocumentFilePath,
} = require('./utils/documentStorage');

const run = async () => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT d.id, d.application_id, d.doc_type, d.file_url, d.storage_key,
              d.original_filename, d.stored_filename, a.application_code, ap.applicant_ref_id
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       JOIN applicants ap ON ap.id = a.applicant_id
       ORDER BY d.id ASC`
    );

    let movedCount = 0;
    let skippedCount = 0;

    for (const row of result.rows) {
      const originalFilename = row.original_filename || path.basename(row.file_url || 'document');
      const storedFilename = row.stored_filename || path.basename(row.file_url || originalFilename);
      const documentCategory = String(row.doc_type || 'document').trim().toLowerCase().replace(/\s+/g, '_') || 'document';
      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: row.applicant_ref_id,
        applicationCode: row.application_code,
        documentCategory,
        filename: storedFilename,
      });

      const currentPath = getDocumentFilePath({ storage_key: row.storage_key, file_url: row.file_url });
      if (currentPath === storageInfo.absolutePath) {
        skippedCount += 1;
        continue;
      }

      if (!fs.existsSync(currentPath)) {
        console.warn(`Skipping document ${row.id}: source file not found at ${currentPath}`);
        skippedCount += 1;
        continue;
      }

      await moveUploadedFile(currentPath, storageInfo.absolutePath);

      await client.query(
        `UPDATE documents
         SET applicant_ref_id = $1,
             application_code = $2,
             document_category = $3,
             original_filename = $4,
             stored_filename = $5,
             storage_key = $6,
             file_url = $6
         WHERE id = $7`,
        [
          row.applicant_ref_id,
          row.application_code,
          documentCategory,
          originalFilename,
          storedFilename,
          storageInfo.relativePath,
          row.id,
        ]
      );

      movedCount += 1;
    }

    console.log(`Document storage migration complete. Moved: ${movedCount}, skipped: ${skippedCount}`);
  } finally {
    client.release();
  }
};

run().catch(async (error) => {
  console.error('Document storage migration failed:', error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});