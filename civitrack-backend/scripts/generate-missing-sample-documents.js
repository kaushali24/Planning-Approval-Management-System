const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const parseArgs = () => {
  const args = process.argv.slice(2);
  return {
    apply: args.includes('--apply'),
    force: args.includes('--force'),
  };
};

const escapePdfText = (value) => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const buildPdfBuffer = (lines) => {
  const safeLines = lines.map((line) => `(${escapePdfText(line)}) Tj`).join('\nT*\n');
  const streamContent = `BT\n/F1 12 Tf\n50 760 Td\n16 TL\n${safeLines}\nET\n`;
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let output = '%PDF-1.4\n';
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(output, 'utf8'));
    output += obj;
  }

  const xrefStart = Buffer.byteLength(output, 'utf8');
  output += `xref\n0 ${objects.length + 1}\n`;
  output += '0000000000 65535 f \n';

  for (let i = 1; i <= objects.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(output, 'utf8');
};

const isSampleDocument = (document) => {
  const fileName = path.basename(document.storage_key || document.file_url || '').toLowerCase();
  return fileName.startsWith('sample-');
};

const toTitleCase = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (char) => char.toUpperCase());

const normalizeDocType = (value) => String(value || 'document').toLowerCase().trim();

const deterministicRef = (document, prefix) => {
  const seed = String(document.id || 0).padStart(4, '0');
  return `${prefix}-${new Date().getFullYear()}-${seed}`;
};

const deterministicDate = (document, offsetDays = 0) => {
  const base = new Date(Date.UTC(2026, 0, 1));
  const step = Number(document.id || 1) % 120;
  base.setUTCDate(base.getUTCDate() + step + offsetDays);
  return base.toISOString().slice(0, 10);
};

const getTemplateByDocType = (document) => {
  const docType = normalizeDocType(document.doc_type);
  const common = [
    `Application Code: ${document.application_code || 'N/A'}`,
    `Applicant Ref: ${document.applicant_ref_id || 'N/A'}`,
    `Document Type: ${toTitleCase(docType)}`,
  ];

  if (docType.includes('site') && docType.includes('plan')) {
    return {
      title: 'Site Plan - Mock Submission Copy',
      body: [
        `Plan Ref: ${deterministicRef(document, 'SP')}`,
        `Survey Date: ${deterministicDate(document, -7)}`,
        'Scale: 1:1000',
        'North Arrow: Included',
        'Boundary Coordinates: Verified (Mock)',
      ],
      footer: 'Prepared for demonstration only. Not valid for legal surveying.',
      common,
    };
  }

  if (docType.includes('deed') || docType.includes('ownership') || docType.includes('title')) {
    return {
      title: 'Proof of Ownership - Mock Record',
      body: [
        `Deed Ref: ${deterministicRef(document, 'DEED')}`,
        `Registry Division: Ward ${((document.id || 1) % 9) + 1}`,
        `Extract Date: ${deterministicDate(document, -20)}`,
        'Current Holder: Sample Applicant',
        'Status: Verified for demo flow',
      ],
      footer: 'Mock ownership extract generated for testing and presentation.',
      common,
    };
  }

  if (docType.includes('tax') || docType.includes('assessment')) {
    return {
      title: 'Tax Clearance Certificate - Mock Copy',
      body: [
        `Certificate No: ${deterministicRef(document, 'TAX')}`,
        `Assessment Year: ${new Date().getFullYear()}`,
        'Outstanding Amount: LKR 0.00',
        `Issued Date: ${deterministicDate(document, -3)}`,
        'Issuing Authority: CiviTrack Revenue Desk (Mock)',
      ],
      footer: 'For internal demonstration only.',
      common,
    };
  }

  if (docType.includes('structural') || docType.includes('drawing') || docType.includes('architect')) {
    return {
      title: 'Building Drawing Set - Mock Summary',
      body: [
        `Drawing Bundle: ${deterministicRef(document, 'DRW')}`,
        'Sheets Included: Ground, First, Elevation, Section',
        'Prepared By: Mock Chartered Draftsperson',
        `Revision: R${((document.id || 1) % 3) + 1}`,
        `Reviewed Date: ${deterministicDate(document, -2)}`,
      ],
      footer: 'This drawing summary is synthetic test content.',
      common,
    };
  }

  return {
    title: 'General Supporting Document - Mock Copy',
    body: [
      `Document Ref: ${deterministicRef(document, 'DOC')}`,
      `Prepared Date: ${deterministicDate(document, -5)}`,
      'Submitted Through: CiviTrack Portal',
      'Review Status: Ready for staff verification',
      'Content Class: Synthetic data for testing',
    ],
    footer: 'Auto-generated placeholder for system demonstration.',
    common,
  };
};

const buildPlaceholderLines = (document) => {
  const fileName = path.basename(document.storage_key || document.file_url || 'document.pdf');
  const template = getTemplateByDocType(document);
  return [
    template.title,
    '----------------------------------------',
    `Document ID: ${document.id}`,
    ...template.common,
    ...template.body,
    '----------------------------------------',
    `Generated File: ${fileName}`,
    `Generated At: ${new Date().toISOString()}`,
    template.footer,
  ];
};

const main = async () => {
  const { apply, force } = parseArgs();
  const projectRoot = path.resolve(__dirname, '..');

  const docs = await pool.query(
    `SELECT id, applicant_ref_id, application_code, doc_type, storage_key, file_url
     FROM documents
     ORDER BY id ASC`
  );

  let alreadyPresent = 0;
  let eligibleMissing = 0;
  let eligibleOverwrite = 0;
  let generated = 0;
  let skippedNonSample = 0;
  let skippedNonPdf = 0;

  for (const doc of docs.rows) {
    const relativePath = doc.storage_key || doc.file_url;
    if (!relativePath) {
      skippedNonSample += 1;
      continue;
    }

    const absolutePath = path.join(projectRoot, relativePath);
    const exists = fs.existsSync(absolutePath);
    if (exists && !force) {
      alreadyPresent += 1;
      continue;
    }

    if (!isSampleDocument(doc)) {
      skippedNonSample += 1;
      continue;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    if (ext !== '.pdf') {
      skippedNonPdf += 1;
      continue;
    }

    if (exists && force) {
      eligibleOverwrite += 1;
    } else {
      eligibleMissing += 1;
    }

    if (!apply) {
      continue;
    }

    const pdfBuffer = buildPdfBuffer(buildPlaceholderLines(doc));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, pdfBuffer);

    await pool.query(
      `UPDATE documents
       SET mime_type = COALESCE(NULLIF(mime_type, ''), 'application/pdf'),
           file_size = $1
       WHERE id = $2`,
      [pdfBuffer.length, doc.id]
    );

    generated += 1;
  }

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    force,
    total: docs.rows.length,
    alreadyPresent,
    eligibleMissing,
    eligibleOverwrite,
    generated,
    skippedNonSample,
    skippedNonPdf,
  };

  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });