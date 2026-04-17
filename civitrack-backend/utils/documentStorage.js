const fs = require('fs');
const path = require('path');

const DOCUMENTS_ROOT = path.join(__dirname, '..', 'uploads', 'documents');
const TEMP_DOCUMENTS_ROOT = path.join(DOCUMENTS_ROOT, '_tmp');

const normalizePathSegment = (value) => String(value ?? '')
  .trim()
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '');

const splitIdentifier = (value) => String(value ?? '')
  .split(/[\\/]+/)
  .map(normalizePathSegment)
  .filter(Boolean);

const createSafeUploadFilename = (originalFilename) => {
  const parsed = path.parse(originalFilename || 'document');
  const safeBase = normalizePathSegment(parsed.name) || 'document';
  const safeExt = parsed.ext ? parsed.ext.toLowerCase().replace(/[<>:"/\\|?*\x00-\x1F]/g, '') : '';
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).slice(2, 8);

  return `${timestamp}-${randomPart}-${safeBase}${safeExt}`;
};

const buildDocumentRelativePath = ({ applicantRefId, applicationCode, documentCategory, filename }) => {
  const segments = [
    'uploads',
    'documents',
    ...splitIdentifier(applicantRefId),
    ...splitIdentifier(applicationCode),
  ];

  if (documentCategory) {
    segments.push(...splitIdentifier(documentCategory));
  }

  segments.push(filename);

  return path.posix.join(...segments);
};

const buildDocumentAbsolutePath = (relativePath) => path.join(__dirname, '..', relativePath);

const buildDocumentStorageInfo = ({ applicantRefId, applicationCode, documentCategory, filename }) => {
  const relativePath = buildDocumentRelativePath({
    applicantRefId,
    applicationCode,
    documentCategory,
    filename,
  });

  return {
    relativePath,
    absolutePath: buildDocumentAbsolutePath(relativePath),
  };
};

const moveUploadedFile = async (sourcePath, targetPath) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.promises.rename(sourcePath, targetPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      await fs.promises.copyFile(sourcePath, targetPath);
      await fs.promises.unlink(sourcePath);
      return;
    }

    throw error;
  }
};

const removeFileIfExists = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

const getDocumentFilePath = (document) => buildDocumentAbsolutePath(document.storage_key || document.file_url || '');

module.exports = {
  DOCUMENTS_ROOT,
  TEMP_DOCUMENTS_ROOT,
  createSafeUploadFilename,
  buildDocumentRelativePath,
  buildDocumentAbsolutePath,
  buildDocumentStorageInfo,
  moveUploadedFile,
  removeFileIfExists,
  getDocumentFilePath,
};