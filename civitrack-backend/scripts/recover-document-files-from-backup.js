const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    backupRoot: null,
    apply: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--backup-root') parsed.backupRoot = args[i + 1];
    if (arg === '--apply') parsed.apply = true;
  }

  return parsed;
};

const walkFiles = (rootDir) => {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }

  return files;
};

const buildFilenameIndex = (backupRoot) => {
  const files = walkFiles(backupRoot);
  const index = new Map();

  for (const absoluteFile of files) {
    const base = path.basename(absoluteFile);
    if (!index.has(base)) {
      index.set(base, []);
    }
    index.get(base).push(absoluteFile);
  }

  return index;
};

const uniqExisting = (paths) => {
  const seen = new Set();
  const out = [];

  for (const item of paths) {
    const resolved = path.resolve(item);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    if (fs.existsSync(resolved)) {
      out.push(resolved);
    }
  }

  return out;
};

const findSourceCandidates = ({ backupRoot, filenameIndex, storageKey, legacyFileUrl }) => {
  const filename = path.basename(storageKey || legacyFileUrl || '');
  const directByStorage = storageKey ? path.join(backupRoot, storageKey) : null;
  const directByLegacy = legacyFileUrl ? path.join(backupRoot, legacyFileUrl) : null;
  const oldFlat = filename ? path.join(backupRoot, 'uploads', 'documents', filename) : null;
  const indexed = filename && filenameIndex.has(filename) ? filenameIndex.get(filename) : [];

  return uniqExisting([
    directByStorage,
    directByLegacy,
    oldFlat,
    ...indexed,
  ].filter(Boolean));
};

const copyFileToTarget = (sourceFile, targetFile) => {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.copyFileSync(sourceFile, targetFile);
};

const main = async () => {
  const { backupRoot, apply } = parseArgs();
  if (!backupRoot) {
    throw new Error('Usage: node scripts/recover-document-files-from-backup.js --backup-root <path> [--apply]');
  }

  const absoluteBackupRoot = path.resolve(backupRoot);
  if (!fs.existsSync(absoluteBackupRoot)) {
    throw new Error(`Backup root does not exist: ${absoluteBackupRoot}`);
  }

  const projectRoot = path.resolve(__dirname, '..');

  const docs = await pool.query(
    `SELECT id, application_id, applicant_ref_id, application_code, doc_type, storage_key, file_url
     FROM documents
     ORDER BY id ASC`
  );

  const filenameIndex = buildFilenameIndex(absoluteBackupRoot);

  let alreadyPresent = 0;
  let recoverable = 0;
  let recovered = 0;
  let missingSource = 0;
  let ambiguousSource = 0;

  const unresolved = [];

  for (const doc of docs.rows) {
    const targetRelative = doc.storage_key || doc.file_url;
    const targetAbsolute = path.join(projectRoot, targetRelative || '');

    if (!targetRelative) {
      missingSource += 1;
      unresolved.push({ id: doc.id, reason: 'No storage_key/file_url present' });
      continue;
    }

    if (fs.existsSync(targetAbsolute)) {
      alreadyPresent += 1;
      continue;
    }

    const candidates = findSourceCandidates({
      backupRoot: absoluteBackupRoot,
      filenameIndex,
      storageKey: doc.storage_key,
      legacyFileUrl: doc.file_url,
    });

    if (candidates.length === 0) {
      missingSource += 1;
      unresolved.push({ id: doc.id, reason: 'No source file found in backup', target: targetRelative });
      continue;
    }

    if (candidates.length > 1) {
      ambiguousSource += 1;
      unresolved.push({ id: doc.id, reason: 'Multiple source candidates found', target: targetRelative, candidates });
      continue;
    }

    recoverable += 1;
    if (apply) {
      copyFileToTarget(candidates[0], targetAbsolute);
      recovered += 1;
    }
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    backupRoot: absoluteBackupRoot,
    total: docs.rows.length,
    alreadyPresent,
    recoverable,
    recovered,
    missingSource,
    ambiguousSource,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (unresolved.length > 0) {
    console.log('UNRESOLVED=' + JSON.stringify(unresolved.slice(0, 50), null, 2));
  }
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });