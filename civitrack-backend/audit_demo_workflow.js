require('dotenv').config();
const { Pool } = require('pg');

const EXPECTED_SEED_KEYS = [
  'appeal-path',
  'permit-path',
  'draft-path',
  'full-cycle-path',
  'correction-path',
  'committee-review-path',
  'boundary-wall-path',
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const out = {
      timestamp: new Date().toISOString(),
      schemaChecks: {},
      workflowChecks: {},
      demoSeedChecks: {},
      findings: [],
    };

    // 1) Referential-participation health checks (logical)
    const applicationsWithoutHistory = await pool.query(`
      SELECT a.id, a.application_code, a.status
      FROM applications a
      LEFT JOIN application_status_history ash ON ash.application_id = a.id
      GROUP BY a.id, a.application_code, a.status
      HAVING COUNT(ash.id) = 0
      ORDER BY a.id
    `);

    const appealWithoutVersion = await pool.query(`
      SELECT ac.id, ac.application_id
      FROM appeal_cases ac
      LEFT JOIN appeal_versions av ON av.appeal_case_id = ac.id
      GROUP BY ac.id, ac.application_id
      HAVING COUNT(av.id) = 0
      ORDER BY ac.id
    `);

    const permitWithoutChecks = await pool.query(`
      SELECT pw.id, pw.application_id, pw.permit_reference
      FROM permit_workflow pw
      LEFT JOIN permit_collection_checks pcc ON pcc.permit_id = pw.id
      GROUP BY pw.id, pw.application_id, pw.permit_reference
      HAVING COUNT(pcc.id) = 0
      ORDER BY pw.id
    `);

    const nonBuildingPermitRows = await pool.query(`
      SELECT
        pw.id,
        pw.application_id,
        pw.permit_reference,
        pw.permit_type,
        a.application_code,
        a.application_type
      FROM permit_workflow pw
      JOIN applications a ON a.id = pw.application_id
      WHERE pw.permit_type IS DISTINCT FROM 'building'
         OR a.application_type IS DISTINCT FROM 'building'
      ORDER BY pw.id
    `);

    const cocWithoutDeclarations = await pool.query(`
      SELECT cr.id, cr.application_id, cr.status
      FROM coc_requests cr
      LEFT JOIN coc_declarations cd ON cd.coc_request_id = cr.id
      GROUP BY cr.id, cr.application_id, cr.status
      HAVING COUNT(cd.id) = 0
      ORDER BY cr.id
    `);

    const correctionStatusWithoutCorrectionRow = await pool.query(`
      SELECT a.id, a.application_code
      FROM applications a
      LEFT JOIN document_corrections dc ON dc.application_id = a.id
      WHERE a.status = 'correction'
      GROUP BY a.id, a.application_code
      HAVING COUNT(dc.id) = 0
      ORDER BY a.id
    `);

    const committeeReviewWithoutDecision = await pool.query(`
      SELECT a.id, a.application_code
      FROM applications a
      LEFT JOIN committee_decisions cd ON cd.application_id = a.id
      WHERE a.status = 'committee_review'
      GROUP BY a.id, a.application_code
      HAVING COUNT(cd.id) = 0
      ORDER BY a.id
    `);

    const permitCollectedFlagMismatch = await pool.query(`
      SELECT
        pw.id,
        pw.application_id,
        pw.permit_reference,
        pw.permit_collected,
        pw.permit_collected_at
      FROM permit_workflow pw
      WHERE (pw.permit_collected = TRUE AND pw.permit_collected_at IS NULL)
         OR (pw.permit_collected = FALSE AND pw.permit_collected_at IS NOT NULL)
      ORDER BY pw.id
    `);

    const permitExtensionWithoutCollectedPermit = await pool.query(`
      SELECT
        pe.id,
        pe.permit_id,
        pe.extension_no,
        pw.application_id,
        pw.permit_reference,
        pw.permit_collected,
        pw.permit_collected_at
      FROM permit_extensions pe
      JOIN permit_workflow pw ON pw.id = pe.permit_id
      WHERE pw.permit_collected IS DISTINCT FROM TRUE
      ORDER BY pe.id
    `);

    const permitExtensionWithInvalidApplicationStatus = await pool.query(`
      SELECT
        pe.id,
        pe.permit_id,
        pe.extension_no,
        a.id AS application_id,
        a.application_code,
        a.status
      FROM permit_extensions pe
      JOIN permit_workflow pw ON pw.id = pe.permit_id
      JOIN applications a ON a.id = pw.application_id
      WHERE a.status NOT IN ('permit_approved', 'permit_collected', 'closed', 'approved', 'endorsed')
      ORDER BY pe.id
    `);

    const permitExtensionWithoutCompletedPayment = await pool.query(`
      SELECT
        pe.id,
        pe.permit_id,
        pe.extension_no,
        pe.fee_amount,
        pw.application_id,
        a.application_code
      FROM permit_extensions pe
      JOIN permit_workflow pw ON pw.id = pe.permit_id
      JOIN applications a ON a.id = pw.application_id
      WHERE pe.payment_status = 'completed'
        AND NOT EXISTS (
          SELECT 1
          FROM payments p
          WHERE p.application_id = pw.application_id
            AND p.payment_type = 'permit_extension_fee'
            AND p.status = 'completed'
            AND p.amount >= pe.fee_amount
        )
      ORDER BY pe.id
    `);

    const permitExtensionSequenceIssues = await pool.query(`
      WITH ordered AS (
        SELECT
          pe.id,
          pe.permit_id,
          pe.extension_no,
          ROW_NUMBER() OVER (PARTITION BY pe.permit_id ORDER BY pe.extension_no ASC) AS expected_no
        FROM permit_extensions pe
      )
      SELECT id, permit_id, extension_no, expected_no
      FROM ordered
      WHERE extension_no <> expected_no
      ORDER BY permit_id, extension_no
    `);

    const permitExtensionCountMismatch = await pool.query(`
      SELECT
        pw.id,
        pw.application_id,
        pw.permit_reference,
        pw.extensions_used,
        COALESCE(COUNT(pe.id), 0)::int AS extension_rows
      FROM permit_workflow pw
      LEFT JOIN permit_extensions pe ON pe.permit_id = pw.id
      GROUP BY pw.id, pw.application_id, pw.permit_reference, pw.extensions_used
      HAVING pw.extensions_used <> COALESCE(COUNT(pe.id), 0)
      ORDER BY pw.id
    `);

    const permitExtensionLimitExceeded = await pool.query(`
      SELECT
        pw.id,
        pw.application_id,
        pw.permit_reference,
        pw.max_years,
        pw.extensions_used,
        COALESCE(COUNT(pe.id), 0)::int AS extension_rows
      FROM permit_workflow pw
      LEFT JOIN permit_extensions pe ON pe.permit_id = pw.id
      GROUP BY pw.id, pw.application_id, pw.permit_reference, pw.max_years, pw.extensions_used
      HAVING pw.extensions_used > pw.max_years - 1
         OR COALESCE(COUNT(pe.id), 0) > pw.max_years - 1
      ORDER BY pw.id
    `);

    const permitStageApplicationsWithoutPermit = await pool.query(`
      SELECT a.id, a.application_code, a.status, a.application_type
      FROM applications a
      LEFT JOIN permit_workflow pw ON pw.application_id = a.id
      WHERE a.application_type = 'building'
        AND a.status IN ('permit_approved', 'permit_collected', 'closed')
      GROUP BY a.id, a.application_code, a.status, a.application_type
      HAVING COUNT(pw.id) = 0
      ORDER BY a.id
    `);

    const permitCollectedStatusWithoutCollectedFlag = await pool.query(`
      SELECT
        a.id,
        a.application_code,
        a.status,
        pw.id AS permit_id,
        pw.permit_collected,
        pw.permit_collected_at
      FROM applications a
      JOIN permit_workflow pw ON pw.application_id = a.id
      WHERE a.status = 'permit_collected'
        AND pw.permit_collected IS DISTINCT FROM TRUE
      ORDER BY a.id
    `);

    const nonBuildingApplicationsInPermitStatuses = await pool.query(`
      SELECT id, application_code, application_type, status
      FROM applications
      WHERE application_type <> 'building'
        AND status IN ('permit_approved', 'permit_collected')
      ORDER BY id
    `);

    out.schemaChecks = {
      applicationsWithoutHistory: applicationsWithoutHistory.rows,
      appealWithoutVersion: appealWithoutVersion.rows,
      permitWithoutChecks: permitWithoutChecks.rows,
      nonBuildingPermitRows: nonBuildingPermitRows.rows,
      cocWithoutDeclarations: cocWithoutDeclarations.rows,
      correctionStatusWithoutCorrectionRow: correctionStatusWithoutCorrectionRow.rows,
      committeeReviewWithoutDecision: committeeReviewWithoutDecision.rows,
      permitCollectedFlagMismatch: permitCollectedFlagMismatch.rows,
      permitExtensionWithoutCollectedPermit: permitExtensionWithoutCollectedPermit.rows,
      permitExtensionWithInvalidApplicationStatus: permitExtensionWithInvalidApplicationStatus.rows,
      permitExtensionWithoutCompletedPayment: permitExtensionWithoutCompletedPayment.rows,
      permitExtensionSequenceIssues: permitExtensionSequenceIssues.rows,
      permitExtensionCountMismatch: permitExtensionCountMismatch.rows,
      permitExtensionLimitExceeded: permitExtensionLimitExceeded.rows,
      permitStageApplicationsWithoutPermit: permitStageApplicationsWithoutPermit.rows,
      permitCollectedStatusWithoutCollectedFlag: permitCollectedStatusWithoutCollectedFlag.rows,
      nonBuildingApplicationsInPermitStatuses: nonBuildingApplicationsInPermitStatuses.rows,
    };

    // 2) Seed coverage checks
    const seedRows = await pool.query(`
      SELECT
        a.id,
        a.application_code,
        a.status,
        a.submitted_email,
        a.project_details->>'seed_key' AS seed_key,
        a.project_details->>'sample_tag' AS sample_tag,
        (
          SELECT COUNT(*)::int
          FROM application_status_history ash
          WHERE ash.application_id = a.id
        ) AS history_count,
        (
          SELECT COUNT(*)::int
          FROM documents d
          WHERE d.application_id = a.id
        ) AS document_count,
        (
          SELECT COUNT(*)::int
          FROM appeal_cases ac
          WHERE ac.application_id = a.id
        ) AS appeal_case_count,
        (
          SELECT COUNT(*)::int
          FROM permit_workflow pw
          WHERE pw.application_id = a.id
        ) AS permit_count,
        (
          SELECT COUNT(*)::int
          FROM coc_requests cr
          WHERE cr.application_id = a.id
        ) AS coc_count,
        (
          SELECT COUNT(*)::int
          FROM inspections i
          WHERE i.application_id = a.id
        ) AS inspection_count,
        (
          SELECT COUNT(*)::int
          FROM document_corrections dc
          WHERE dc.application_id = a.id
        ) AS correction_count,
        (
          SELECT COUNT(*)::int
          FROM notifications n
          WHERE n.related_application_id = a.id
        ) AS notification_count,
        (
          SELECT COUNT(*)::int
          FROM payments p
          WHERE p.application_id = a.id
        ) AS payment_count
      FROM applications a
      WHERE a.project_details ? 'seed_key'
      ORDER BY a.id
    `);

    const rowsBySeed = new Map();
    for (const row of seedRows.rows) {
      if (!rowsBySeed.has(row.seed_key)) rowsBySeed.set(row.seed_key, []);
      rowsBySeed.get(row.seed_key).push(row);
    }

    const missingSeeds = EXPECTED_SEED_KEYS.filter((k) => !rowsBySeed.has(k));
    out.demoSeedChecks = {
      totalSeededApplications: seedRows.rows.length,
      presentSeedKeys: Array.from(rowsBySeed.keys()),
      missingExpectedSeedKeys: missingSeeds,
      perSeed: Object.fromEntries(
        Array.from(rowsBySeed.entries()).map(([key, val]) => [key, val])
      ),
    };

    // 3) Workflow-specific coverage checks for expected seeds
    const requireBySeed = {
      'appeal-path': ['appeal_case_count', 'history_count'],
      'permit-path': ['permit_count', 'coc_count', 'inspection_count', 'history_count'],
      'draft-path': ['history_count'],
      'full-cycle-path': ['permit_count', 'coc_count', 'inspection_count', 'history_count', 'payment_count'],
      'correction-path': ['history_count'],
      'committee-review-path': ['history_count'],
    };

    const coverageIssues = [];
    for (const [seedKey, required] of Object.entries(requireBySeed)) {
      const records = rowsBySeed.get(seedKey) || [];
      if (!records.length) continue;
      for (const rec of records) {
        for (const field of required) {
          if (Number(rec[field]) <= 0) {
            coverageIssues.push({
              seedKey,
              applicationId: rec.id,
              applicationCode: rec.application_code,
              missing: field,
            });
          }
        }
      }
    }

    out.workflowChecks = { coverageIssues };

    // 4) Findings summary
    const pushFinding = (severity, message, data) => {
      out.findings.push({ severity, message, data });
    };

    if (applicationsWithoutHistory.rows.length) {
      pushFinding('high', 'Applications exist without status history rows.', applicationsWithoutHistory.rows);
    }
    if (missingSeeds.length) {
      pushFinding('high', 'Expected demo seed paths are missing.', missingSeeds);
    }
    if (coverageIssues.length) {
      pushFinding('high', 'Seed records missing required workflow-linked data.', coverageIssues);
    }
    if (correctionStatusWithoutCorrectionRow.rows.length) {
      pushFinding('medium', 'Applications in correction status have no document_corrections records.', correctionStatusWithoutCorrectionRow.rows);
    }
    if (committeeReviewWithoutDecision.rows.length) {
      pushFinding('medium', 'Applications in committee_review have no committee_decisions records (may be pending by design).', committeeReviewWithoutDecision.rows);
    }
    if (permitWithoutChecks.rows.length) {
      pushFinding('medium', 'Some permit records have no permit_collection_checks rows.', permitWithoutChecks.rows);
    }
    if (nonBuildingPermitRows.rows.length) {
      pushFinding('high', 'Legacy non-building permit workflow rows still exist.', nonBuildingPermitRows.rows);
    }
    if (permitCollectedFlagMismatch.rows.length) {
      pushFinding('high', 'Permit collection flags are inconsistent with permit_collected_at.', permitCollectedFlagMismatch.rows);
    }
    if (permitExtensionWithoutCollectedPermit.rows.length) {
      pushFinding('high', 'Permit extensions exist for permits that are not yet collected.', permitExtensionWithoutCollectedPermit.rows);
    }
    if (permitExtensionWithInvalidApplicationStatus.rows.length) {
      pushFinding('high', 'Permit extensions exist while application status is outside permit lifecycle states.', permitExtensionWithInvalidApplicationStatus.rows);
    }
    if (permitExtensionWithoutCompletedPayment.rows.length) {
      pushFinding('high', 'Permit extensions marked completed are missing completed permit_extension_fee payments.', permitExtensionWithoutCompletedPayment.rows);
    }
    if (permitExtensionSequenceIssues.rows.length) {
      pushFinding('high', 'Permit extension numbering is not sequential from 1.', permitExtensionSequenceIssues.rows);
    }
    if (permitExtensionCountMismatch.rows.length) {
      pushFinding('high', 'permit_workflow.extensions_used does not match permit_extensions row count.', permitExtensionCountMismatch.rows);
    }
    if (permitExtensionLimitExceeded.rows.length) {
      pushFinding('high', 'Permit extensions exceed configured max_years lifecycle limit.', permitExtensionLimitExceeded.rows);
    }
    if (permitStageApplicationsWithoutPermit.rows.length) {
      pushFinding('high', 'Building applications in permit lifecycle statuses have no permit_workflow row.', permitStageApplicationsWithoutPermit.rows);
    }
    if (permitCollectedStatusWithoutCollectedFlag.rows.length) {
      pushFinding('high', 'Applications in permit_collected status have uncollected permit_workflow rows.', permitCollectedStatusWithoutCollectedFlag.rows);
    }
    if (nonBuildingApplicationsInPermitStatuses.rows.length) {
      pushFinding('high', 'Non-building applications are in permit-only statuses.', nonBuildingApplicationsInPermitStatuses.rows);
    }
    if (cocWithoutDeclarations.rows.length) {
      pushFinding('medium', 'Some COC requests have no declarations rows.', cocWithoutDeclarations.rows);
    }
    if (appealWithoutVersion.rows.length) {
      pushFinding('high', 'Appeal cases exist without at least one appeal version.', appealWithoutVersion.rows);
    }

    // Workflow counts snapshot for demo coverage quick view
    const quickCounts = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM applications) AS applications,
        (SELECT COUNT(*)::int FROM application_status_history) AS application_status_history,
        (SELECT COUNT(*)::int FROM documents) AS documents,
        (SELECT COUNT(*)::int FROM inspections) AS inspections,
        (SELECT COUNT(*)::int FROM coc_requests) AS coc_requests,
        (SELECT COUNT(*)::int FROM coc_declarations) AS coc_declarations,
        (SELECT COUNT(*)::int FROM permit_workflow) AS permit_workflow,
        (SELECT COUNT(*)::int FROM permit_collection_checks) AS permit_collection_checks,
        (SELECT COUNT(*)::int FROM permit_extensions) AS permit_extensions,
        (SELECT COUNT(*)::int FROM appeal_cases) AS appeal_cases,
        (SELECT COUNT(*)::int FROM appeal_versions) AS appeal_versions,
        (SELECT COUNT(*)::int FROM appeal_documents) AS appeal_documents,
        (SELECT COUNT(*)::int FROM document_corrections) AS document_corrections,
        (SELECT COUNT(*)::int FROM committee_decisions) AS committee_decisions,
        (SELECT COUNT(*)::int FROM payments) AS payments,
        (SELECT COUNT(*)::int FROM notifications) AS notifications
    `);

    out.quickCounts = quickCounts.rows[0];

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
