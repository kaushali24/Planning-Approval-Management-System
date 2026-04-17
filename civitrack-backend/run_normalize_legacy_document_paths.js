const path = require('path');
const pool = require('./config/db');
const { buildDocumentStorageInfo } = require('./utils/documentStorage');

const run = async () => {
  const client = await pool.connect();

  try {
    const rows = await client.query(
      `SELECT id, doc_type, file_url, storage_key, applicant_ref_id, application_code, original_filename, stored_filename
       FROM documents
       ORDER BY id ASC`
    );

    let updatedCount = 0;
    let skippedCount = 0;

    for (const doc of rows.rows) {
      if (!doc.applicant_ref_id || !doc.application_code) {
        skippedCount += 1;
        continue;
      }

      const filename = doc.stored_filename
        || doc.original_filename
        || path.basename(doc.storage_key || doc.file_url || 'document');

      const storageInfo = buildDocumentStorageInfo({
        applicantRefId: doc.applicant_ref_id,
        applicationCode: doc.application_code,
        documentCategory: doc.doc_type,
        filename,
      });

      const currentKey = doc.storage_key || doc.file_url || '';
      if (currentKey === storageInfo.relativePath) {
        skippedCount += 1;
        continue;
      }

      await client.query(
        `UPDATE documents
         SET document_category = COALESCE(NULLIF(document_category, ''), $1),
             original_filename = COALESCE(NULLIF(original_filename, ''), $2),
             stored_filename = COALESCE(NULLIF(stored_filename, ''), $2),
             storage_key = $3,
             file_url = $3
         WHERE id = $4`,
        [doc.doc_type, filename, storageInfo.relativePath, doc.id]
      );

      updatedCount += 1;
    }

    console.log(`Legacy document path normalization complete. Updated: ${updatedCount}, skipped: ${skippedCount}`);
  } finally {
    client.release();
  }
};

run().catch(async (error) => {
  console.error('Legacy document path normalization failed:', error);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});