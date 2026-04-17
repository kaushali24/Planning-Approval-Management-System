#!/usr/bin/env node
/**
 * CiviTrack Sample Workflow Seeder
 * Seeds applications and workflow records for the demo applicant email.
 */

const pool = require('./config/db');
const { buildDocumentStorageInfo } = require('./utils/documentStorage');

const DEMO_APPLICANT_EMAIL = 'pabodakaushali2001@gmail.com';

const SAMPLE_SEEDS = [
  {
    seedKey: 'appeal-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '18 Lake Road, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'building',
    status: 'appeal_submitted',
    assessmentNumber: 'ASS-2026-001',
    deedNumber: 'DEED-2026-001',
    surveyPlanRef: 'SP-2026-001',
    landExtent: '10 perches',
    projectDetails: {
      seed_key: 'appeal-path',
      sample_tag: 'civitrack-sample-2026',
      project: 'Two-storey residence',
    },
    latitude: 6.9654321,
    longitude: 79.9154321,
    declarationAccepted: true,
    assignedToRole: 'technical_officer',
    reviewedByRole: 'superintendent',
    reviewedAt: daysAgo(4),
    committeeDecision: 'rejected',
    committeeNotes: 'Needs revised setbacks before approval.',
    decidedAt: daysAgo(4),
    submissionDate: daysAgo(7),
    lastUpdated: daysAgo(2),
    documents: [
      { docType: 'site-plan', fileUrl: 'uploads/documents/sample-appeal-site-plan.pdf' },
      { docType: 'deed-copy', fileUrl: 'uploads/documents/sample-appeal-deed-copy.pdf' },
    ],
    statusHistory: [
      { status: 'submitted', reason: 'Sample application submitted.', sourceStage: 'submission', changedByRole: 'admin' },
      { status: 'under_review', reason: 'Technical review started.', sourceStage: 'review', changedByRole: 'technical_officer' },
      { status: 'rejected', reason: 'Committee requested revised setbacks.', sourceStage: 'committee', changedByRole: 'superintendent' },
      { status: 'appeal_submitted', reason: 'Applicant filed an appeal.', sourceStage: 'appeal', changedByRole: 'admin' },
    ],
    appeal: {
      route: 'committee',
      status: 'forwarded-to-committee',
      additionalFee: 2500,
      portalOpen: true,
      summary: 'Appeal after setback revision request.',
      correctionsCategory: 'plans',
      specialCircumstances: 'Applicant will resubmit revised elevations.',
      containsNewPlans: true,
      documents: [
        { label: 'Revised elevation sketch', kind: 'corrected', required: true, sourceDocType: 'site-plan' },
        { label: 'Additional site note', kind: 'additional', required: false, sourceDocType: null },
      ],
      notes: ['Appeal opened for workflow coverage testing.'],
    },
    payments: [
      {
        referenceType: 'application',
        paymentType: 'application_fee',
        amount: 5000,
        status: 'completed',
        transactionId: 'TXN-APP-APPEAL-PATH',
        paymentMethod: 'card',
        paidAt: daysAgo(6),
      },
    ],
    notifications: [
      {
        target: 'applicant',
        notificationType: 'application_status',
        title: 'Appeal Submitted',
        message: 'Your appeal has been submitted and queued for review.',
        priority: 'normal',
      },
      {
        targetRole: 'technical_officer',
        notificationType: 'assignment_received',
        title: 'Application Needs Follow-up',
        message: 'Please review updated appeal-related documents for this application.',
        priority: 'high',
      },
    ],
  },
  {
    seedKey: 'permit-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '42 Station Road, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'building',
    status: 'permit_collected',
    assessmentNumber: 'ASS-2026-002',
    deedNumber: 'DEED-2026-002',
    surveyPlanRef: 'SP-2026-002',
    landExtent: '12 perches',
    projectDetails: {
      seed_key: 'permit-path',
      sample_tag: 'civitrack-sample-2026',
      project: 'Single-storey residence',
    },
    latitude: 6.9723456,
    longitude: 79.9212345,
    declarationAccepted: true,
    assignedToRole: 'technical_officer',
    reviewedByRole: 'superintendent',
    reviewedAt: daysAgo(5),
    committeeDecision: 'approved',
    committeeNotes: 'Meets planning requirements.',
    decidedAt: daysAgo(5),
    submissionDate: daysAgo(9),
    lastUpdated: daysAgo(1),
    documents: [
      { docType: 'site-plan', fileUrl: 'uploads/documents/sample-permit-site-plan.pdf' },
      { docType: 'completion-certificate', fileUrl: 'uploads/documents/sample-permit-completion-certificate.pdf' },
    ],
    statusHistory: [
      { status: 'submitted', reason: 'Sample application submitted.', sourceStage: 'submission', changedByRole: 'admin' },
      { status: 'approved', reason: 'Planning review approved.', sourceStage: 'review', changedByRole: 'superintendent' },
      { status: 'permit_approved', reason: 'Permit issued for sample workflow.', sourceStage: 'permit', changedByRole: 'admin' },
      { status: 'permit_collected', reason: 'Permit collected at the counter.', sourceStage: 'collection', changedByRole: 'admin' },
    ],
    inspection: {
      scheduledDate: daysAgo(3),
      result: 'compliant',
      observations: 'Setbacks and roof height match approved drawings.',
      recommendation: 'approve',
    },
    coc: {
      cocId: 'COC-2026-000002',
      status: 'coc-collected',
      declarations: ['construction_complete', 'ready_for_inspection', 'understands_enforcement'],
      feeAmount: 1500,
      notes: 'Sample COC request for permit testing.',
      inspectionCompletedAt: daysAgo(2),
      approvedByCommitteeAt: daysAgo(2),
      issuedAt: daysAgo(2),
      collectedAt: daysAgo(1),
      validUntil: yearsFromNow(2),
    },
    permit: {
      permitReference: 'PRM-2026-000002',
      permitType: 'building',
      issuedAt: daysAgo(2),
      validUntil: yearsFromNow(5),
      permitCollected: true,
      permitCollectedAt: daysAgo(1),
      maxYears: 5,
      extensionsUsed: 0,
      verification: { seed_key: 'permit-path', sample_tag: 'civitrack-sample-2026', collected: true },
      collectionChecks: [
        { checkType: 'applicant_identity_verified', isCompleted: true },
        { checkType: 'official_permit_signed_and_sealed', isCompleted: true },
        { checkType: 'handover_register_signed', isCompleted: true },
        { checkType: 'permit_copy_retained', isCompleted: true },
      ],
      extensions: [
        {
          extensionNo: 1,
          feeAmount: 5000,
          paymentStatus: 'completed',
          paymentReference: 'TXN-EXT-PERMIT-PATH',
          paymentMethod: 'bank_transfer',
          previousValidUntil: yearsFromNow(5),
          extendedValidUntil: yearsFromNow(6),
          approvedAt: daysAgo(1),
          notes: 'Demo permit extension approved for one additional year.',
        },
      ],
    },
    payments: [
      {
        referenceType: 'application',
        paymentType: 'application_fee',
        amount: 5000,
        status: 'completed',
        transactionId: 'TXN-APP-PERMIT-PATH',
        paymentMethod: 'cash',
        paidAt: daysAgo(8),
      },
      {
        referenceType: 'coc',
        paymentType: 'coc_fee',
        amount: 1500,
        status: 'completed',
        transactionId: 'TXN-COC-PERMIT-PATH',
        paymentMethod: 'card',
        paidAt: daysAgo(2),
      },
      {
        referenceType: 'application',
        paymentType: 'permit_extension_fee',
        amount: 5000,
        status: 'completed',
        transactionId: 'TXN-EXT-PERMIT-PATH',
        paymentMethod: 'bank_transfer',
        paidAt: daysAgo(1),
      },
    ],
    notifications: [
      {
        target: 'applicant',
        notificationType: 'permit_collected',
        title: 'Permit Collected Successfully',
        message: 'Your permit has been marked as collected at the counter.',
        priority: 'normal',
      },
      {
        targetRole: 'superintendent',
        notificationType: 'review_completed',
        title: 'Permit Workflow Completed',
        message: 'Permit issuance and collection completed for this sample application.',
        priority: 'low',
      },
    ],
  },
  {
    seedKey: 'draft-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '14 Temple Road, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'building',
    status: 'draft',
    assessmentNumber: 'ASS-2026-003',
    deedNumber: 'DEED-2026-003',
    surveyPlanRef: 'SP-2026-003',
    landExtent: '8 perches',
    projectDetails: {
      seed_key: 'draft-path',
      sample_tag: 'civitrack-demo-2026',
      project: 'Draft house plan pending final submission',
    },
    latitude: 6.9690012,
    longitude: 79.9185533,
    declarationAccepted: false,
    assignedToRole: null,
    reviewedByRole: null,
    submissionDate: daysAgo(1),
    lastUpdated: daysAgo(1),
    documents: [],
    statusHistory: [
      { status: 'draft', reason: 'Saved as draft during applicant data entry.', sourceStage: 'draft', changedByRole: 'admin' },
    ],
  },
  {
    seedKey: 'full-cycle-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '120 Gampaha Road, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'building',
    status: 'closed',
    assessmentNumber: 'ASS-2026-006',
    deedNumber: 'DEED-2026-006',
    surveyPlanRef: 'SP-2026-006',
    landExtent: '14 perches',
    projectDetails: {
      seed_key: 'full-cycle-path',
      sample_tag: 'civitrack-demo-2026',
      project: 'Two-floor residential house - full lifecycle demo',
    },
    latitude: 6.9742123,
    longitude: 79.9267741,
    declarationAccepted: true,
    assignedToRole: 'technical_officer',
    reviewedByRole: 'superintendent',
    reviewedAt: daysAgo(14),
    committeeDecision: 'approved',
    committeeNotes: 'Approved and closed after permit collection completion.',
    decidedAt: daysAgo(12),
    submissionDate: daysAgo(20),
    lastUpdated: daysAgo(1),
    documents: [
      { docType: 'site-plan', fileUrl: 'uploads/documents/sample-fullcycle-site-plan.pdf' },
      { docType: 'deed-copy', fileUrl: 'uploads/documents/sample-fullcycle-deed-copy.pdf' },
      { docType: 'structural-sketch', fileUrl: 'uploads/documents/sample-fullcycle-structural-sketch.pdf' },
    ],
    statusHistory: [
      { status: 'draft', reason: 'Applicant started a new application form.', sourceStage: 'draft', changedByRole: 'admin' },
      { status: 'submitted', reason: 'Applicant submitted completed form.', sourceStage: 'submission', changedByRole: 'admin' },
      { status: 'under_review', reason: 'Technical review started.', sourceStage: 'review', changedByRole: 'technical_officer' },
      { status: 'approved', reason: 'Planning review approved.', sourceStage: 'review', changedByRole: 'superintendent' },
      { status: 'permit_approved', reason: 'Building permit issued.', sourceStage: 'permit', changedByRole: 'admin' },
      { status: 'permit_collected', reason: 'Permit collected by applicant.', sourceStage: 'collection', changedByRole: 'admin' },
      { status: 'closed', reason: 'Workflow closed after completion.', sourceStage: 'closure', changedByRole: 'admin' },
    ],
    inspection: {
      scheduledDate: daysAgo(13),
      result: 'compliant',
      observations: 'Construction matched approved drawings and setback requirements.',
      recommendation: 'approve',
    },
    coc: {
      cocId: 'COC-2026-000006',
      status: 'coc-collected',
      declarations: ['construction_complete', 'ready_for_inspection', 'understands_enforcement'],
      feeAmount: 1500,
      notes: 'Full-cycle demo COC request completed.',
      inspectionCompletedAt: daysAgo(10),
      approvedByCommitteeAt: daysAgo(9),
      issuedAt: daysAgo(8),
      collectedAt: daysAgo(7),
      validUntil: yearsFromNow(2),
    },
    permit: {
      permitReference: 'PRM-2026-000006',
      permitType: 'building',
      issuedAt: daysAgo(12),
      validUntil: yearsFromNow(5),
      permitCollected: true,
      permitCollectedAt: daysAgo(7),
      maxYears: 5,
      extensionsUsed: 0,
      verification: { seed_key: 'full-cycle-path', sample_tag: 'civitrack-demo-2026', collected: true },
      collectionChecks: [
        { checkType: 'applicant_identity_verified', isCompleted: true },
        { checkType: 'official_permit_signed_and_sealed', isCompleted: true },
        { checkType: 'handover_register_signed', isCompleted: true },
        { checkType: 'permit_copy_retained', isCompleted: true },
      ],
    },
    payments: [
      {
        referenceType: 'application',
        paymentType: 'application_fee',
        amount: 5000,
        status: 'completed',
        transactionId: 'TXN-APP-FULL-CYCLE',
        paymentMethod: 'card',
        paidAt: daysAgo(19),
      },
      {
        referenceType: 'coc',
        paymentType: 'coc_fee',
        amount: 1500,
        status: 'completed',
        transactionId: 'TXN-COC-FULL-CYCLE',
        paymentMethod: 'card',
        paidAt: daysAgo(9),
      },
    ],
    notifications: [
      {
        target: 'applicant',
        notificationType: 'application_status',
        title: 'Application Closed Successfully',
        message: 'Your full-cycle demo application has completed all stages and is now closed.',
        priority: 'normal',
      },
    ],
  },
  {
    seedKey: 'correction-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '22 River View, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'subdivision',
    status: 'correction',
    assessmentNumber: 'ASS-2026-004',
    deedNumber: 'DEED-2026-004',
    surveyPlanRef: 'SP-2026-004',
    landExtent: '20 perches',
    projectDetails: {
      seed_key: 'correction-path',
      sample_tag: 'civitrack-demo-2026',
      project: 'Land subdivision with pending correction request',
    },
    latitude: 6.9702234,
    longitude: 79.9224511,
    declarationAccepted: true,
    assignedToRole: 'technical_officer',
    reviewedByRole: 'planning_officer',
    reviewedAt: daysAgo(3),
    committeeDecision: null,
    committeeNotes: null,
    decidedAt: null,
    submissionDate: daysAgo(6),
    lastUpdated: daysAgo(2),
    documents: [
      { docType: 'subdivision-plan', fileUrl: 'uploads/documents/sample-correction-subdivision-plan.pdf' },
    ],
    statusHistory: [
      { status: 'submitted', reason: 'Subdivision application submitted.', sourceStage: 'submission', changedByRole: 'admin' },
      { status: 'under_review', reason: 'Planning officer review started.', sourceStage: 'review', changedByRole: 'planning_officer' },
      { status: 'correction', reason: 'Lot dimensions need clarification.', sourceStage: 'review', changedByRole: 'technical_officer' },
    ],
    notifications: [
      {
        target: 'applicant',
        notificationType: 'document_correction',
        title: 'Correction Required',
        message: 'Please update the subdivision plan dimensions and resubmit.',
        priority: 'high',
      },
    ],
  },
  {
    seedKey: 'committee-review-path',
    applicantEmail: DEMO_APPLICANT_EMAIL,
    submittedApplicantName: 'Paboda Kaushali',
    submittedNicNumber: '200112345679',
    submittedAddress: '88 Main Street, Kelaniya',
    submittedContact: '0772345678',
    applicationType: 'building',
    status: 'committee_review',
    assessmentNumber: 'ASS-2026-005',
    deedNumber: 'DEED-2026-005',
    surveyPlanRef: 'SP-2026-005',
    landExtent: '15 perches',
    projectDetails: {
      seed_key: 'committee-review-path',
      sample_tag: 'civitrack-demo-2026',
      project: 'Commercial extension awaiting committee decision',
    },
    latitude: 6.9739012,
    longitude: 79.9242231,
    declarationAccepted: true,
    assignedToRole: 'technical_officer',
    reviewedByRole: 'superintendent',
    reviewedAt: daysAgo(2),
    committeeDecision: null,
    committeeNotes: 'Ready for committee agenda.',
    decidedAt: null,
    submissionDate: daysAgo(5),
    lastUpdated: daysAgo(1),
    documents: [
      { docType: 'site-plan', fileUrl: 'uploads/documents/sample-committee-site-plan.pdf' },
      { docType: 'structural-sketch', fileUrl: 'uploads/documents/sample-committee-structural-sketch.pdf' },
    ],
    statusHistory: [
      { status: 'submitted', reason: 'Submitted for review.', sourceStage: 'submission', changedByRole: 'admin' },
      { status: 'under_review', reason: 'Technical review completed.', sourceStage: 'review', changedByRole: 'technical_officer' },
      { status: 'committee_review', reason: 'Forwarded by superintendent.', sourceStage: 'committee', changedByRole: 'superintendent' },
    ],
    notifications: [
      {
        targetRole: 'committee',
        notificationType: 'committee_decision',
        title: 'New Committee Review Item',
        message: 'A building application is awaiting committee review.',
        priority: 'normal',
      },
    ],
  },
];

function daysAgo(days) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function yearsFromNow(years) {
  const value = new Date();
  value.setFullYear(value.getFullYear() + years);
  return value;
}

async function getApplicantReferenceColumn() {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'applicants'
       AND column_name IN ('applicant_ref_id', 'applicant_id')
     ORDER BY CASE WHEN column_name = 'applicant_ref_id' THEN 1 ELSE 2 END
     LIMIT 1`
  );

  return result.rows[0]?.column_name || null;
}

async function loadApplicants() {
  const applicantRefColumn = await getApplicantReferenceColumn();
  const applicantRefSelect = applicantRefColumn
    ? `, ${applicantRefColumn} AS applicant_ref`
    : '';

  const rows = await pool.query(
    `SELECT id, full_name, email${applicantRefSelect} FROM applicants WHERE email = $1`,
    [DEMO_APPLICANT_EMAIL]
  );

  const applicants = {};
  for (const row of rows.rows) {
    applicants[row.email] = row;
  }

  return applicants;
}

async function loadStaff() {
  const roles = ['admin', 'planning_officer', 'technical_officer', 'superintendent', 'committee'];
  const staff = {};

  for (const role of roles) {
    const result = await pool.query(
      'SELECT id, staff_id, full_name, email, role FROM staff_accounts WHERE role = $1 ORDER BY id ASC LIMIT 1',
      [role]
    );

    if (result.rows.length > 0) {
      staff[role] = result.rows[0];
    }
  }

  return staff;
}

async function ensureApplication(seed, applicants, staff) {
  const existing = await pool.query(
    `SELECT id, status
     FROM applications
     WHERE project_details->>'seed_key' = $1
     LIMIT 1`,
    [seed.seedKey]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const applicant = applicants[seed.applicantEmail];
  const assignedTo = staff[seed.assignedToRole] || null;
  const reviewedBy = staff[seed.reviewedByRole] || null;

  const result = await pool.query(
    `INSERT INTO applications (
      applicant_id,
      status,
      submission_date,
      last_updated,
      application_type,
      submitted_applicant_name,
      submitted_nic_number,
      submitted_address,
      submitted_contact,
      submitted_email,
      assessment_number,
      deed_number,
      survey_plan_ref,
      land_extent,
      project_details,
      latitude,
      longitude,
      declaration_accepted,
      assigned_to,
      reviewed_by,
      reviewed_at,
      committee_decision,
      committee_notes,
      decided_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20, $21, $22, $23, $24
    )
    RETURNING id`,
    [
      applicant.id,
      seed.status,
      seed.submissionDate,
      seed.lastUpdated,
      seed.applicationType,
      seed.submittedApplicantName,
      seed.submittedNicNumber,
      seed.submittedAddress,
      seed.submittedContact,
      seed.applicantEmail,
      seed.assessmentNumber,
      seed.deedNumber,
      seed.surveyPlanRef,
      seed.landExtent,
      JSON.stringify(seed.projectDetails),
      seed.latitude,
      seed.longitude,
      seed.declarationAccepted,
      assignedTo ? assignedTo.id : null,
      reviewedBy ? reviewedBy.id : null,
      seed.reviewedAt || null,
      seed.committeeDecision || null,
      seed.committeeNotes || null,
      seed.decidedAt || null,
    ]
  );

  return result.rows[0].id;
}

async function ensureDocuments(applicationId, documents) {
  const created = {};

  const appMeta = await pool.query(
    `SELECT a.application_code, ap.applicant_ref_id
     FROM applications a
     JOIN applicants ap ON ap.id = a.applicant_id
     WHERE a.id = $1`,
    [applicationId]
  );

  if (!appMeta.rows.length) {
    throw new Error(`Application ${applicationId} not found while seeding documents`);
  }

  const { application_code: applicationCode, applicant_ref_id: applicantRefId } = appMeta.rows[0];

  for (const document of documents) {
    const storedFilename = document.fileUrl ? String(document.fileUrl).split('/').pop() : `${document.docType}.pdf`;
    const storageInfo = buildDocumentStorageInfo({
      applicantRefId,
      applicationCode,
      documentCategory: document.docType,
      filename: storedFilename,
    });

    const existing = await pool.query(
      `SELECT id, doc_type, file_url, storage_key
       FROM documents
       WHERE application_id = $1
         AND doc_type = $2
         AND (
           COALESCE(storage_key, file_url) = $3
           OR COALESCE(storage_key, file_url) = $4
         )
       LIMIT 1`,
      [applicationId, document.docType, document.fileUrl, storageInfo.relativePath]
    );

    if (existing.rows.length > 0) {
      const currentStorageKey = existing.rows[0].storage_key || existing.rows[0].file_url;
      if (currentStorageKey !== storageInfo.relativePath) {
        const updated = await pool.query(
          `UPDATE documents
           SET applicant_ref_id = $1,
               application_code = $2,
               document_category = $3,
               original_filename = $4,
               stored_filename = $5,
               storage_key = $6,
               file_url = $6
           WHERE id = $7
           RETURNING id, doc_type, file_url, storage_key`,
          [
            applicantRefId,
            applicationCode,
            document.docType,
            storedFilename,
            storedFilename,
            storageInfo.relativePath,
            existing.rows[0].id,
          ]
        );
        created[document.docType] = updated.rows[0];
        continue;
      }
      created[document.docType] = existing.rows[0];
      continue;
    }

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
         file_url
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id, doc_type, file_url, storage_key`,
      [
        applicationId,
        applicantRefId,
        applicationCode,
        document.docType,
        document.docType,
        storedFilename,
        storedFilename,
        storageInfo.relativePath,
      ]
    );

    created[document.docType] = result.rows[0];
  }

  return created;
}

async function ensureStatusHistory(applicationId, statusHistory, staff) {
  for (const item of statusHistory) {
    const changedBy = staff[item.changedByRole] || null;
    const existing = await pool.query(
      `SELECT id
       FROM application_status_history
       WHERE application_id = $1 AND status = $2 AND COALESCE(reason, '') = COALESCE($3, '') AND COALESCE(source_stage, '') = COALESCE($4, '')
       LIMIT 1`,
      [applicationId, item.status, item.reason || null, item.sourceStage || null]
    );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO application_status_history (application_id, status, changed_by, changed_at, reason, source_stage)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [applicationId, item.status, changedBy ? changedBy.id : null, item.changedAt || new Date(), item.reason || null, item.sourceStage || null]
    );
  }
}

async function ensureInspection(applicationId, inspection, staff) {
  if (!inspection) {
    return null;
  }

  const technicalOfficer = staff.technical_officer || staff.admin;
  const existing = await pool.query(
    `SELECT id
     FROM inspections
     WHERE application_id = $1 AND scheduled_date = $2 AND result = $3
     LIMIT 1`,
    [applicationId, inspection.scheduledDate, inspection.result]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [applicationId, technicalOfficer ? technicalOfficer.id : null, inspection.scheduledDate, inspection.result, inspection.observations || null, inspection.recommendation || null]
  );

  return result.rows[0].id;
}

async function ensureCocRequest(applicationId, applicant, inspectionId, coc, staff) {
  if (!coc) {
    return null;
  }

  const existing = await pool.query('SELECT id FROM coc_requests WHERE application_id = $1 LIMIT 1', [applicationId]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const technicalOfficer = staff.technical_officer || staff.admin;
  const result = await pool.query(
    `INSERT INTO coc_requests (
      coc_id,
      application_id,
      applicant_id,
      applicant_email,
      applicant_name,
      status,
      inspection_id,
      declarations,
      fee_amount,
      notes,
      issued_at,
      approved_by_committee_at,
      collected_at,
      inspection_completed_at,
      assigned_to,
      assigned_at,
      fee_calculated_at,
      paid_at,
      valid_until
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    RETURNING id`,
    [
      coc.cocId,
      applicationId,
      applicant.id,
      applicant.email,
      applicant.full_name,
      coc.status,
      inspectionId,
      JSON.stringify(coc.declarations || []),
      coc.feeAmount || null,
      coc.notes || null,
      coc.issuedAt || null,
      coc.approvedByCommitteeAt || null,
      coc.collectedAt || null,
      coc.inspectionCompletedAt || null,
      technicalOfficer ? technicalOfficer.id : null,
      coc.assignedAt || new Date(),
      coc.feeCalculatedAt || coc.issuedAt || null,
      coc.paidAt || coc.collectedAt || null,
      coc.validUntil || null,
    ]
  );

  return result.rows[0].id;
}

async function ensureCocDeclarations(cocRequestId, declarations) {
  for (const declarationType of declarations || []) {
    const existing = await pool.query(
      `SELECT id
       FROM coc_declarations
       WHERE coc_request_id = $1 AND declaration_type = $2
       LIMIT 1`,
      [cocRequestId, declarationType]
    );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO coc_declarations (coc_request_id, declaration_type, accepted, acknowledged_at)
       VALUES ($1, $2, TRUE, NOW())`,
      [cocRequestId, declarationType]
    );
  }
}

async function ensurePermitWorkflow(applicationId, permit, staff) {
  if (!permit) {
    return null;
  }

  if (String(permit.permitType || '').trim().toLowerCase() !== 'building') {
    return null;
  }

  const existing = await pool.query('SELECT id FROM permit_workflow WHERE application_id = $1 LIMIT 1', [applicationId]);
  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  const admin = staff.admin || null;
  const result = await pool.query(
    `INSERT INTO permit_workflow (
      application_id,
      permit_reference,
      permit_type,
      issued_at,
      valid_until,
      permit_collected,
      permit_collected_at,
      issued_by,
      collected_by,
      max_years,
      extensions_used,
      extension_history,
      verification
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb)
    RETURNING id`,
    [
      applicationId,
      permit.permitReference,
      permit.permitType,
      permit.issuedAt || null,
      permit.validUntil || null,
      permit.permitCollected || false,
      permit.permitCollectedAt || null,
      admin ? admin.id : null,
      admin ? admin.id : null,
      permit.maxYears || 5,
      permit.extensionsUsed || 0,
      JSON.stringify(permit.extensionHistory || []),
      JSON.stringify(permit.verification || {}),
    ]
  );

  return result.rows[0].id;
}

async function ensurePermitChecks(permitId, checks) {
  for (const check of checks || []) {
    const existing = await pool.query(
      `SELECT id
       FROM permit_collection_checks
       WHERE permit_id = $1 AND check_type = $2
       LIMIT 1`,
      [permitId, check.checkType]
    );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO permit_collection_checks (permit_id, check_type, is_completed, checked_at, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [permitId, check.checkType, check.isCompleted !== false, check.checkedAt || new Date(), check.note || null]
    );
  }
}

async function ensurePermitExtensions(permitId, permit, staff) {
  if (!permit || !Array.isArray(permit.extensions) || permit.extensions.length === 0) {
    return;
  }

  const approver = staff.superintendent || staff.admin || null;

  for (const extension of permit.extensions) {
    const existing = await pool.query(
      `SELECT id
       FROM permit_extensions
       WHERE permit_id = $1 AND extension_no = $2
       LIMIT 1`,
      [permitId, extension.extensionNo]
    );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO permit_extensions (
        permit_id,
        extension_no,
        fee_amount,
        payment_status,
        payment_reference,
        payment_method,
        previous_valid_until,
        extended_valid_until,
        approved_by,
        approved_at,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        permitId,
        extension.extensionNo,
        extension.feeAmount || 5000,
        extension.paymentStatus || 'completed',
        extension.paymentReference || null,
        extension.paymentMethod || null,
        extension.previousValidUntil,
        extension.extendedValidUntil,
        approver ? approver.id : null,
        extension.approvedAt || new Date(),
        extension.notes || null,
      ]
    );
  }

  const stats = await pool.query(
    `SELECT
      COUNT(*)::int AS extension_count,
      MAX(extended_valid_until) AS latest_valid_until
     FROM permit_extensions
     WHERE permit_id = $1`,
    [permitId]
  );

  const extensionCount = stats.rows[0]?.extension_count || 0;
  const latestValidUntil = stats.rows[0]?.latest_valid_until || null;

  await pool.query(
    `UPDATE permit_workflow
     SET extensions_used = $1,
         valid_until = COALESCE($2, valid_until),
         updated_at = NOW()
     WHERE id = $3`,
    [extensionCount, latestValidUntil, permitId]
  );
}

async function ensurePayments({ applicationId, cocRequestId, fineId = null, payments = [] }) {
  for (const payment of payments) {
    const referenceType = payment.referenceType || 'application';

    let applicationRef = null;
    let cocRef = null;
    let fineRef = null;

    if (referenceType === 'application') {
      applicationRef = applicationId;
    } else if (referenceType === 'coc') {
      if (!cocRequestId) {
        continue;
      }
      cocRef = cocRequestId;
    } else if (referenceType === 'fine') {
      if (!fineId) {
        continue;
      }
      fineRef = fineId;
    } else {
      continue;
    }

    const existing = payment.transactionId
      ? await pool.query('SELECT id FROM payments WHERE transaction_id = $1 LIMIT 1', [payment.transactionId])
      : await pool.query(
          `SELECT id
           FROM payments
           WHERE COALESCE(application_id, 0) = COALESCE($1, 0)
             AND COALESCE(coc_request_id, 0) = COALESCE($2, 0)
             AND COALESCE(fine_id, 0) = COALESCE($3, 0)
             AND payment_type = $4
             AND amount = $5
           LIMIT 1`,
          [applicationRef, cocRef, fineRef, payment.paymentType, payment.amount]
        );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO payments (
        application_id,
        coc_request_id,
        fine_id,
        payment_type,
        amount,
        status,
        transaction_id,
        payment_method,
        paid_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        applicationRef,
        cocRef,
        fineRef,
        payment.paymentType,
        payment.amount,
        payment.status || 'completed',
        payment.transactionId || null,
        payment.paymentMethod || null,
        payment.paidAt || null,
        payment.createdAt || payment.paidAt || new Date(),
      ]
    );
  }
}

async function ensureNotifications({ applicationId, applicant, staff, notifications = [] }) {
  for (const notification of notifications) {
    const userType = notification.target === 'applicant' ? 'applicant' : 'staff';
    const applicantId = userType === 'applicant' ? applicant.id : null;
    const staffMember = userType === 'staff' ? staff[notification.targetRole] || null : null;
    const staffId = staffMember ? staffMember.id : null;

    if (userType === 'staff' && !staffId) {
      continue;
    }

    const existing = await pool.query(
      `SELECT id
       FROM notifications
       WHERE notification_type = $1
         AND title = $2
         AND message = $3
         AND COALESCE(applicant_id, 0) = COALESCE($4, 0)
         AND COALESCE(staff_id, 0) = COALESCE($5, 0)
         AND COALESCE(related_application_id, 0) = COALESCE($6, 0)
       LIMIT 1`,
      [notification.notificationType, notification.title, notification.message, applicantId, staffId, applicationId]
    );

    if (existing.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO notifications (
        user_type,
        applicant_id,
        staff_id,
        notification_type,
        title,
        message,
        related_application_id,
        related_entity_type,
        related_entity_id,
        priority,
        is_read,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11)`,
      [
        userType,
        applicantId,
        staffId,
        notification.notificationType,
        notification.title,
        notification.message,
        applicationId,
        notification.relatedEntityType || 'application',
        notification.relatedEntityId || applicationId,
        notification.priority || 'normal',
        notification.createdAt || new Date(),
      ]
    );
  }
}

async function ensureAppeal(applicationId, appeal, staff, documentMap) {
  if (!appeal) {
    return null;
  }

  const existing = await pool.query('SELECT id FROM appeal_cases WHERE application_id = $1 LIMIT 1', [applicationId]);
  const appealCaseId = existing.rows.length > 0
    ? existing.rows[0].id
    : (await pool.query(
        `INSERT INTO appeal_cases (application_id, route, status, portal_open, additional_fee)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [applicationId, appeal.route, appeal.status, appeal.portalOpen !== false, appeal.additionalFee || null]
      )).rows[0].id;

  const versionExisting = await pool.query('SELECT id FROM appeal_versions WHERE appeal_case_id = $1 AND appeal_no = 1 LIMIT 1', [appealCaseId]);
  const versionId = versionExisting.rows.length > 0
    ? versionExisting.rows[0].id
    : (await pool.query(
        `INSERT INTO appeal_versions (
          appeal_case_id,
          appeal_no,
          summary,
          corrections_category,
          special_circumstances,
          contains_new_plans,
          planning_assessment,
          required_actions
        )
        VALUES ($1, 1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          appealCaseId,
          appeal.summary || null,
          appeal.correctionsCategory || null,
          appeal.specialCircumstances || null,
          appeal.containsNewPlans !== false,
          appeal.planningAssessment || null,
          appeal.requiredActions || null,
        ]
      )).rows[0].id;

  for (const doc of appeal.documents || []) {
    const sourceDocument = doc.sourceDocType ? documentMap[doc.sourceDocType] : null;
    const existingDoc = await pool.query(
      `SELECT id
       FROM appeal_documents
       WHERE appeal_version_id = $1 AND label = $2 AND kind = $3 AND COALESCE(document_id, 0) = COALESCE($4, 0)
       LIMIT 1`,
      [versionId, doc.label, doc.kind, sourceDocument ? sourceDocument.id : null]
    );

    if (existingDoc.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO appeal_documents (appeal_version_id, document_id, label, kind, required)
       VALUES ($1, $2, $3, $4, $5)`,
      [versionId, sourceDocument ? sourceDocument.id : null, doc.label, doc.kind, doc.required !== false]
    );
  }

  for (const note of appeal.notes || []) {
    const existingNote = await pool.query(
      `SELECT id
       FROM appeal_member_notes
       WHERE appeal_case_id = $1 AND note = $2
       LIMIT 1`,
      [appealCaseId, note]
    );

    if (existingNote.rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO appeal_member_notes (appeal_case_id, noted_by, note)
       VALUES ($1, $2, $3)`,
      [appealCaseId, staff.admin ? staff.admin.id : null, note]
    );
  }

  return appealCaseId;
}

async function seed() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('CiviTrack Sample Workflow Setup');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    const applicants = await loadApplicants();
    const staff = await loadStaff();

    if (!applicants[DEMO_APPLICANT_EMAIL]) {
      throw new Error(`Missing demo applicant ${DEMO_APPLICANT_EMAIL}. Run setup-test-accounts.js first.`);
    }

    if (!staff.admin || !staff.technical_officer || !staff.superintendent) {
      throw new Error('Missing required staff accounts. Run setup-test-accounts.js first.');
    }

    for (const seed of SAMPLE_SEEDS) {
      const applicationId = await ensureApplication(seed, applicants, staff);
      const documentMap = await ensureDocuments(applicationId, seed.documents);
      await ensureStatusHistory(applicationId, seed.statusHistory, staff);

      let inspectionId = null;
      if (seed.inspection) {
        inspectionId = await ensureInspection(applicationId, seed.inspection, staff);
      }

      let cocRequestId = null;
      if (seed.coc) {
        cocRequestId = await ensureCocRequest(applicationId, applicants[seed.applicantEmail], inspectionId, seed.coc, staff);
        await ensureCocDeclarations(cocRequestId, seed.coc.declarations);
      }

      if (seed.permit) {
        const permitId = await ensurePermitWorkflow(applicationId, seed.permit, staff);
        await ensurePermitChecks(permitId, seed.permit.collectionChecks);
        await ensurePermitExtensions(permitId, seed.permit, staff);
      }

      if (seed.appeal) {
        await ensureAppeal(applicationId, seed.appeal, staff, documentMap);
      }

      await ensurePayments({
        applicationId,
        cocRequestId,
        payments: seed.payments || [],
      });

      await ensureNotifications({
        applicationId,
        applicant: applicants[seed.applicantEmail],
        staff,
        notifications: seed.notifications || [],
      });

      console.log(`✓ Seeded workflow data for ${seed.submittedApplicantName}`);
    }

    const applicantRefColumn = await getApplicantReferenceColumn();
    const applicantRefSelect = applicantRefColumn
      ? `ap.${applicantRefColumn} AS applicant_ref`
      : 'NULL::text AS applicant_ref';

    const summary = await pool.query(
      `SELECT
         a.id,
         a.application_code,
         a.status,
         a.submitted_applicant_name,
         a.submitted_email,
         ${applicantRefSelect}
       FROM applications a
       LEFT JOIN applicants ap ON ap.id = a.applicant_id
        WHERE a.submitted_email = $1
       ORDER BY a.id`,
        [DEMO_APPLICANT_EMAIL]
    );

    console.log('\nSEEDED APPLICATIONS:');
    summary.rows.forEach((row) => {
      const appCode = row.application_code || row.id;
      const applicantRef = row.applicant_ref ? ` | ${row.applicant_ref}` : '';
      console.log(`  • ${appCode}${applicantRef}: ${row.submitted_applicant_name} (${row.submitted_email}) -> ${row.status}`);
    });

    const workflowCounts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM payments) AS payments,
         (SELECT COUNT(*)::int FROM notifications) AS notifications`
    );

    console.log(`\nWorkflow coverage rows -> payments: ${workflowCounts.rows[0].payments}, notifications: ${workflowCounts.rows[0].notifications}`);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✓ Sample workflow setup complete');
    console.log('═══════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();