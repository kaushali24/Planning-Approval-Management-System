require('dotenv').config();
const { Pool } = require('pg');

async function one(client, sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows[0] || null;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const apps = await client.query(`
      SELECT id, application_code, status, application_type, applicant_id, project_details->>'seed_key' AS seed_key
      FROM applications
      WHERE project_details ? 'seed_key'
    `);

    const appBySeed = new Map();
    for (const a of apps.rows) appBySeed.set(a.seed_key, a);

    const staffRows = await client.query(`
      SELECT id, role FROM staff_accounts
      WHERE role IN ('admin','technical_officer','planning_officer','superintendent','committee')
      ORDER BY id
    `);
    const staffByRole = new Map();
    for (const s of staffRows.rows) {
      if (!staffByRole.has(s.role)) staffByRole.set(s.role, s.id);
    }

    const adminId = staffByRole.get('admin');
    const techId = staffByRole.get('technical_officer') || adminId;
    const planningId = staffByRole.get('planning_officer') || adminId;
    const superId = staffByRole.get('superintendent') || adminId;
    const committeeId = staffByRole.get('committee') || adminId;

    // 0) Permit workflow integrity cleanup (building-only and extension counters)
    await client.query(`
      DELETE FROM permit_workflow
      WHERE permit_type <> 'building'
    `);

    await client.query(`
      WITH extension_stats AS (
        SELECT
          pe.permit_id,
          COUNT(*)::int AS extension_count,
          MAX(pe.extended_valid_until) AS latest_valid_until
        FROM permit_extensions pe
        GROUP BY pe.permit_id
      )
      UPDATE permit_workflow pw
      SET extensions_used = COALESCE(es.extension_count, 0),
          valid_until = COALESCE(es.latest_valid_until, pw.valid_until),
          updated_at = NOW()
      FROM extension_stats es
      WHERE pw.id = es.permit_id
        AND (
          pw.extensions_used IS DISTINCT FROM es.extension_count
          OR pw.valid_until IS DISTINCT FROM COALESCE(es.latest_valid_until, pw.valid_until)
        )
    `);

    await client.query(`
      UPDATE permit_workflow
      SET extensions_used = 0,
          updated_at = NOW()
      WHERE id NOT IN (SELECT DISTINCT permit_id FROM permit_extensions)
        AND extensions_used <> 0
    `);

    const normalizedNonBuildingStatuses = await client.query(`
      UPDATE applications
      SET status = 'approved',
          last_updated = NOW()
      WHERE application_type <> 'building'
        AND status IN ('permit_approved', 'permit_collected')
      RETURNING id
    `);

    for (const row of normalizedNonBuildingStatuses.rows) {
      await client.query(
        `INSERT INTO application_status_history (application_id, status, changed_by, changed_at, reason, source_stage)
         VALUES ($1, 'approved', $2, NOW(), $3, 'data_cleanup')`,
        [row.id, adminId, 'Normalized non-building application status from permit lifecycle state']
      );
    }

    // Fix: applications without status history
    const appsWithoutHistory = await client.query(`
      SELECT a.id, a.status
      FROM applications a
      LEFT JOIN application_status_history ash ON ash.application_id = a.id
      GROUP BY a.id, a.status
      HAVING COUNT(ash.id) = 0
    `);

    for (const row of appsWithoutHistory.rows) {
      await client.query(
        `INSERT INTO application_status_history (application_id, status, changed_by, changed_at, reason, source_stage)
         VALUES ($1, $2, $3, NOW(), $4, $5)`,
        [row.id, row.status || 'submitted', adminId, 'Backfilled demo history row', 'backfill']
      );
    }

    // 1) application_permit_selections
    for (const app of apps.rows) {
      const code = app.application_type === 'boundary'
        ? 'boundary_wall'
        : app.application_type === 'subdivision'
          ? 'subdivision'
          : 'building';
      const exists = await one(
        client,
        `SELECT id FROM application_permit_selections WHERE application_id = $1 AND permit_code = $2 LIMIT 1`,
        [app.id, code]
      );
      if (!exists) {
        await client.query(
          `INSERT INTO application_permit_selections (application_id, permit_code, selected_at)
           VALUES ($1, $2, NOW())`,
          [app.id, code]
        );
      }
    }

    // 2) application_assignments (one realistic record for committee-review path)
    const committeeApp = appBySeed.get('committee-review-path');
    if (committeeApp) {
      const exists = await one(
        client,
        `SELECT id FROM application_assignments WHERE application_id = $1 LIMIT 1`,
        [committeeApp.id]
      );
      if (!exists && techId && superId && techId !== superId) {
        await client.query(
          `INSERT INTO application_assignments (
             application_id, assigned_to, assigned_by, assignment_type, status, priority,
             assigned_at, accepted_at, due_date, notes, workload_count
           )
           VALUES ($1, $2, $3, 'committee_review', 'accepted', 'high', NOW(), NOW(), NOW() + INTERVAL '3 days', $4, 1)`,
          [committeeApp.id, techId, superId, 'Demo assignment for committee review workflow']
        );
      }
    }

    // 3) application_holds (resolved technical deficiency on correction path)
    const correctionApp = appBySeed.get('correction-path');
    if (correctionApp) {
      const exists = await one(client, `SELECT id FROM application_holds WHERE application_id = $1 LIMIT 1`, [correctionApp.id]);
      if (!exists) {
        await client.query(
          `INSERT INTO application_holds (
             application_id, hold_type, hold_status, reason, clearance_authority,
             requested_by, requested_at, resolved_by, resolved_at, resolution_note
           )
           VALUES ($1, 'technical-deficiency', 'resolved', $2, $3, $4, NOW() - INTERVAL '2 days', $5, NOW() - INTERVAL '1 day', $6)`,
          [
            correctionApp.id,
            'Subdivision dimensions required clarification',
            'Planning Unit',
            techId,
            planningId,
            'Applicant submitted revised plan and hold was cleared',
          ]
        );
      }
    }

    // 4) document_corrections (for correction-path)
    if (correctionApp) {
      const exists = await one(client, `SELECT id FROM document_corrections WHERE application_id = $1 LIMIT 1`, [correctionApp.id]);
      if (!exists) {
        const doc = await one(
          client,
          `SELECT id, doc_type FROM documents WHERE application_id = $1 ORDER BY id LIMIT 1`,
          [correctionApp.id]
        );
        if (doc) {
          await client.query(
            `INSERT INTO document_corrections (
               application_id, original_document_id, doc_type, rejection_reason, requested_by,
               requested_at, status
             )
             VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '2 days', 'pending')`,
            [
              correctionApp.id,
              doc.id,
              doc.doc_type,
              'Please correct lot dimensions and scale annotations.',
              techId,
            ]
          );
        }
      }
    }

    // 5) committee_decisions (for appeal-path app)
    const appealApp = appBySeed.get('appeal-path');
    if (appealApp) {
      const exists = await one(client, `SELECT id FROM committee_decisions WHERE application_id = $1 AND decision_no = 1`, [appealApp.id]);
      if (!exists) {
        await client.query(
          `INSERT INTO committee_decisions (
             application_id, decision_no, decision_type, decision_reason, decision_notes,
             decided_by, decided_at, requires_non_indemnification, recommendation_snapshot, sw_note_snapshot
           )
           VALUES ($1, 1, 'not-granted', $2, $3, $4, NOW() - INTERVAL '4 days', FALSE, 'reject', $5)`,
          [
            appealApp.id,
            'Setback dimensions did not satisfy committee requirements in first pass.',
            'Appeal path sample decision for demo coverage.',
            committeeId,
            'Recommend revision and resubmission through appeal process.',
          ]
        );
      }
    }

    // 6) COC violations and reinspection on permit-path app's coc
    const permitApp = appBySeed.get('permit-path');
    let permitCoc = null;
    if (permitApp) {
      permitCoc = await one(client, `SELECT id, inspection_id FROM coc_requests WHERE application_id = $1 LIMIT 1`, [permitApp.id]);
    }

    if (permitCoc) {
      const vioExists = await one(client, `SELECT id FROM coc_violations WHERE coc_request_id = $1 LIMIT 1`, [permitCoc.id]);
      if (!vioExists) {
        await client.query(
          `INSERT INTO coc_violations (
             coc_request_id, inspection_id, deviation_type, comments, fine_amount, no_appeal,
             inspection_type, reported_by, reported_at
           )
           VALUES ($1, $2, $3, $4, 2500, TRUE, 'initial-inspection', $5, NOW() - INTERVAL '2 days')`,
          [
            permitCoc.id,
            permitCoc.inspection_id,
            'minor-offset-deviation',
            'Minor offset deviation recorded for demo workflow coverage.',
            techId,
          ]
        );
      }

      const reExists = await one(client, `SELECT id FROM coc_reinspections WHERE coc_request_id = $1 AND round_no = 1`, [permitCoc.id]);
      if (!reExists) {
        await client.query(
          `INSERT INTO coc_reinspections (
             coc_request_id, round_no, requested_at, completed_at, result, technical_officer_id, notes
           )
           VALUES ($1, 1, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', 'compliant', $2, $3)`,
          [permitCoc.id, techId, 'Reinspection completed successfully for demo coverage.']
        );
      }
    }

    // 7) fines (linked to first inspection)
    const anyInspection = await one(client, `SELECT id FROM inspections ORDER BY id LIMIT 1`);
    if (anyInspection) {
      const fineExists = await one(client, `SELECT id FROM fines WHERE inspection_id = $1 LIMIT 1`, [anyInspection.id]);
      if (!fineExists) {
        await client.query(
          `INSERT INTO fines (inspection_id, staff_id, amount, reason, imposed_at)
           VALUES ($1, $2, 2500, $3, NOW() - INTERVAL '1 day')`,
          [anyInspection.id, techId, 'Demo deviation fine for workflow coverage']
        );
      }
    }

    // 8) non_indemnification_agreements
    if (appealApp) {
      const niaExists = await one(client, `SELECT id FROM non_indemnification_agreements WHERE application_id = $1 AND agreement_no = 1`, [appealApp.id]);
      if (!niaExists) {
        await client.query(
          `INSERT INTO non_indemnification_agreements (
             application_id, agreement_no, requested_by, requested_at, applicant_id,
             status, agreed_at, recorded_by, document_id, note
           )
           VALUES ($1, 1, $2, NOW() - INTERVAL '1 day', $3, 'agreed', NOW() - INTERVAL '12 hours', $4, NULL, $5)`,
          [
            appealApp.id,
            adminId,
            appealApp.applicant_id,
            adminId,
            'Demo non-indemnification agreement recorded for coverage.',
          ]
        );
      }
    }

    // 9) password_resets demo row
    const demoEmail = 'pabodakaushali2001@gmail.com';
    const prExists = await one(client, `SELECT id FROM password_resets WHERE email = $1 LIMIT 1`, [demoEmail]);
    if (!prExists) {
      await client.query(
        `INSERT INTO password_resets (email, token, expires_at, created_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes', NOW())`,
        [demoEmail, '123456']
      );
    }

    // 10) Dashboard live-data gap coverage for empty staff sections
    const fallbackApplicantId = apps.rows[0]?.applicant_id || null;
    if (fallbackApplicantId) {
      const makeCoverageApp = async ({ seedKey, status, submittedName, nic, address, contact, email, assignedTo = null, reviewedBy = null }) => {
        const existingApp = await one(
          client,
          `SELECT id, applicant_id, application_code FROM applications WHERE project_details->>'seed_key' = $1 LIMIT 1`,
          [seedKey]
        );

        if (existingApp) {
          return existingApp;
        }

        const inserted = await one(
          client,
          `INSERT INTO applications (
             applicant_id, status, submission_date, last_updated, application_type,
             submitted_applicant_name, submitted_nic_number, submitted_address, submitted_contact, submitted_email,
             assessment_number, deed_number, survey_plan_ref, land_extent, project_details,
             latitude, longitude, declaration_accepted, assigned_to, reviewed_by
           )
           VALUES (
             $1, $2, NOW() - INTERVAL '1 day', NOW(), 'building',
             $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12::jsonb,
             6.9352, 79.8548, TRUE, $13, $14
           )
           RETURNING id, applicant_id, application_code`,
          [
            fallbackApplicantId,
            status,
            submittedName,
            nic,
            address,
            contact,
            email,
            `ASM-${seedKey}`,
            `DEED-${seedKey}`,
            `SP-${seedKey}`,
            '10 perches',
            JSON.stringify({
              seed_key: seedKey,
              sample_tag: 'civitrack-sample-2026',
              coverage: 'dashboard-live-gap-fill',
            }),
            assignedTo,
            reviewedBy,
          ]
        );

        await client.query(
          `INSERT INTO application_status_history (application_id, status, changed_by, changed_at, reason, source_stage)
           VALUES ($1, $2, $3, NOW(), $4, 'dashboard_seed')`,
          [inserted.id, status, adminId, 'Dashboard section live-data coverage seed']
        );

        return inserted;
      };

      const submittedCoverage = await makeCoverageApp({
        seedKey: 'dashboard-submitted-path',
        status: 'submitted',
        submittedName: 'Nadeesha Fernando',
        nic: '199845612345',
        address: '115 Main Street, Kelaniya',
        contact: '0778456123',
        email: 'pabodakaushali2001@gmail.com',
      });

      const underReviewCoverage = await makeCoverageApp({
        seedKey: 'dashboard-under-review-path',
        status: 'under_review',
        submittedName: 'Ruwan Jayasinghe',
        nic: '198934512347',
        address: '24 Temple Road, Peliyagoda',
        contact: '0713456123',
        email: 'pabodakaushali2001@gmail.com',
      });

      const endorsedCoverage = await makeCoverageApp({
        seedKey: 'dashboard-endorsed-path',
        status: 'endorsed',
        submittedName: 'Iresha Perera',
        nic: '199223456781',
        address: '9 Canal View, Kelaniya',
        contact: '0752345678',
        email: 'pabodakaushali2001@gmail.com',
        assignedTo: techId,
        reviewedBy: superId,
      });

      const permitAwaitingCollectionCoverage = await makeCoverageApp({
        seedKey: 'dashboard-permit-awaiting-collection',
        status: 'permit_approved',
        submittedName: 'Sajini Wijesinghe',
        nic: '199556789012',
        address: '42 Kandy Road, Kelaniya',
        contact: '0776677889',
        email: 'pabodakaushali2001@gmail.com',
        assignedTo: planningId,
        reviewedBy: committeeId,
      });

      const ensureAssignment = async (applicationId, assignedTo, assignedBy, assignmentType = 'technical_review') => {
        if (!applicationId || !assignedTo) return;
        const existing = await one(
          client,
          `SELECT id FROM application_assignments WHERE application_id = $1 AND assigned_to = $2 AND status IN ('pending','accepted','in_progress') LIMIT 1`,
          [applicationId, assignedTo]
        );
        if (existing) return;

        await client.query(
          `INSERT INTO application_assignments (
             application_id, assigned_to, assigned_by, assignment_type, status, priority,
             assigned_at, accepted_at, due_date, notes, workload_count
           )
           VALUES ($1, $2, $3, $4, 'accepted', 'normal', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '11 hours', NOW() + INTERVAL '2 days', $5, 1)`,
          [applicationId, assignedTo, assignedBy || adminId, assignmentType, 'Dashboard workflow assignment seed']
        );
      };

      await ensureAssignment(underReviewCoverage.id, techId, planningId, 'technical_review');
      await ensureAssignment(endorsedCoverage.id, techId, planningId, 'committee_review');

      const ensureInspection = async (applicationId, staffId, recommendation, observations, result = 'pending') => {
        if (!applicationId || !staffId) return null;
        const existing = await one(
          client,
          `SELECT id FROM inspections WHERE application_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
          [applicationId]
        );
        if (existing) return existing;

        return one(
          client,
          `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation, created_at)
           VALUES ($1, $2, NOW() - INTERVAL '10 hours', $3, $4, $5, NOW() - INTERVAL '8 hours')
           RETURNING id`,
          [applicationId, staffId, result, observations, recommendation]
        );
      };

      const underReviewInspection = await ensureInspection(
        underReviewCoverage.id,
        techId,
        'approve',
        'Site dimensions verified; pending final report sign-off.',
        'pending'
      );
      const endorsedInspection = await ensureInspection(
        endorsedCoverage.id,
        techId,
        'approve',
        'Full compliance confirmed for committee-ready file.',
        'compliant'
      );

      const ensurePayment = async (applicationId, amount, status, method, transactionId, paidOffset = '6 hours') => {
        if (!applicationId) return;
        const existing = await one(
          client,
          `SELECT id FROM payments WHERE application_id = $1 AND payment_type = 'application_fee' LIMIT 1`,
          [applicationId]
        );
        if (existing) return;

        await client.query(
          `INSERT INTO payments (application_id, coc_request_id, fine_id, payment_type, amount, status, transaction_id, payment_method, paid_at, created_at)
           VALUES ($1, NULL, NULL, 'application_fee', $2, $3, $4, $5, NOW() - ($6)::interval, NOW() - INTERVAL '7 hours')`,
          [applicationId, amount, status, transactionId, method, paidOffset]
        );
      };

      await ensurePayment(underReviewCoverage.id, 7500, 'completed', 'online', 'APPFEE-UNDERREV-001');
      await ensurePayment(endorsedCoverage.id, 9800, 'completed', 'bank', 'APPFEE-ENDORSED-001');

      const permitExists = await one(
        client,
        `SELECT id FROM permit_workflow WHERE application_id = $1 LIMIT 1`,
        [permitAwaitingCollectionCoverage.id]
      );
      if (!permitExists) {
        await client.query(
          `INSERT INTO permit_workflow (
             application_id, permit_reference, permit_type, issued_at, valid_until,
             permit_collected, permit_collected_at, issued_by, collected_by,
             max_years, extensions_used, extension_history, verification, created_at, updated_at
           )
           VALUES (
             $1, $2, 'building', NOW() - INTERVAL '4 hours', NOW() + INTERVAL '1 year',
             FALSE, NULL, $3, NULL,
             5, 0, '[]'::jsonb, '{}'::jsonb, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '4 hours'
           )`,
          [
            permitAwaitingCollectionCoverage.id,
            permitAwaitingCollectionCoverage.application_code || `PRM-DASH-${permitAwaitingCollectionCoverage.id}`,
            committeeId || adminId,
          ]
        );
      }

      const seededPermit = await one(
        client,
        `SELECT id FROM permit_workflow WHERE application_id = $1 LIMIT 1`,
        [permitAwaitingCollectionCoverage.id]
      );
      if (seededPermit) {
        const permitCheckTypes = [
          'applicant_identity_verified',
          'official_permit_signed_and_sealed',
          'handover_register_signed',
          'permit_copy_retained',
        ];

        for (const checkType of permitCheckTypes) {
          const existingCheck = await one(
            client,
            `SELECT id FROM permit_collection_checks WHERE permit_id = $1 AND check_type = $2 LIMIT 1`,
            [seededPermit.id, checkType]
          );
          if (!existingCheck) {
            await client.query(
              `INSERT INTO permit_collection_checks (permit_id, check_type, is_completed, checked_at, note)
               VALUES ($1, $2, FALSE, NULL, $3)`,
              [seededPermit.id, checkType, 'Prepared as pending checklist for physical permit collection demo flow']
            );
          }
        }
      }

      const ensureAppealCase = async (applicationId, route, status) => {
        if (!applicationId) return null;
        const existing = await one(client, `SELECT id FROM appeal_cases WHERE application_id = $1 LIMIT 1`, [applicationId]);
        if (existing) {
          await client.query(
            `UPDATE appeal_cases
             SET route = $2,
                 status = $3,
                 updated_at = NOW()
             WHERE id = $1`,
            [existing.id, route, status]
          );
          return existing;
        }

        const inserted = await one(
          client,
          `INSERT INTO appeal_cases (application_id, route, status, portal_open, additional_fee, created_at, updated_at)
           VALUES ($1, $2, $3, TRUE, 0, NOW() - INTERVAL '9 hours', NOW() - INTERVAL '4 hours')
           RETURNING id`,
          [applicationId, route, status]
        );

        await client.query(
          `INSERT INTO appeal_versions (
             appeal_case_id, appeal_no, summary, corrections_category, special_circumstances,
             contains_new_plans, submitted_at, planning_assessment, required_actions
           )
           VALUES ($1, 1, $2, 'documents', $3, FALSE, NOW() - INTERVAL '8 hours', $4, $5)`,
          [
            inserted.id,
            `Dashboard route coverage sample for ${route}.`,
            'Seeded to ensure route-based dashboard queues are demonstrable.',
            'Needs route-specific technical verification update.',
            'Prepare route confirmation note for committee visibility.',
          ]
        );

        return inserted;
      };

      await ensureAppealCase(submittedCoverage.id, 'superintendent', 'routed-to-to');
      await ensureAppealCase(underReviewCoverage.id, 'superintendent', 'under-review');
      await ensureAppealCase(endorsedCoverage.id, 'planning-section', 'under-review');

      const ensureCocCase = async ({ applicationId, status, assignedTo = null, inspectionId = null, feeAmount = 6500, withPayment = false }) => {
        if (!applicationId) return;
        const existing = await one(client, `SELECT id FROM coc_requests WHERE application_id = $1 LIMIT 1`, [applicationId]);
        if (existing) return existing;

        const appRow = await one(
          client,
          `SELECT submitted_email, submitted_applicant_name FROM applications WHERE id = $1`,
          [applicationId]
        );

        const inserted = await one(
          client,
          `INSERT INTO coc_requests (
             coc_id, application_id, applicant_id, applicant_email, applicant_name,
             request_date, status, fee_amount, fee_calculated_at, paid_at,
             assigned_to, assigned_at, inspection_id, inspection_completed_at,
             declarations, notes
           )
           VALUES (
             $1, $2, $3, $4, $5,
             NOW() - INTERVAL '1 day', $6::varchar, $7, NOW() - INTERVAL '20 hours',
             CASE WHEN $6::text IN ('assigned-to-to','inspection-complete','reinspection-requested','correction-submitted') THEN NOW() - INTERVAL '18 hours' ELSE NULL END,
             $8::int, CASE WHEN $8::int IS NOT NULL THEN NOW() - INTERVAL '16 hours' ELSE NULL END,
             $9::int, CASE WHEN $6::text = 'inspection-complete' THEN NOW() - INTERVAL '2 hours' ELSE NULL END,
             '{}'::jsonb, 'Dashboard COC workflow coverage seed'
           )
           RETURNING id`,
          [
            `COC-DASH-${applicationId}`,
            applicationId,
            fallbackApplicantId,
            appRow?.submitted_email || demoEmail,
            appRow?.submitted_applicant_name || 'Applicant',
            status,
            feeAmount,
            assignedTo,
            inspectionId,
          ]
        );

        if (withPayment) {
          const paymentExists = await one(
            client,
            `SELECT id FROM payments WHERE coc_request_id = $1 AND payment_type = 'coc_fee' LIMIT 1`,
            [inserted.id]
          );
          if (!paymentExists) {
            await client.query(
              `INSERT INTO payments (application_id, coc_request_id, fine_id, payment_type, amount, status, transaction_id, payment_method, paid_at, created_at)
               VALUES (NULL, $1, NULL, 'coc_fee', $2, 'completed', $3, 'online', NOW() - INTERVAL '17 hours', NOW() - INTERVAL '17 hours')`,
              [inserted.id, feeAmount, `COCFEE-${applicationId}`]
            );
          }
        }

        return inserted;
      };

      const cocFeeCalculated = await ensureCocCase({
        applicationId: submittedCoverage.id,
        status: 'fee-calculated',
        assignedTo: null,
        inspectionId: null,
        feeAmount: 5000,
        withPayment: false,
      });

      const cocAssigned = await ensureCocCase({
        applicationId: underReviewCoverage.id,
        status: 'assigned-to-to',
        assignedTo: techId,
        inspectionId: underReviewInspection?.id || null,
        feeAmount: 6200,
        withPayment: true,
      });

      const cocInspectionComplete = await ensureCocCase({
        applicationId: endorsedCoverage.id,
        status: 'inspection-complete',
        assignedTo: techId,
        inspectionId: endorsedInspection?.id || null,
        feeAmount: 7100,
        withPayment: true,
      });

      const ensureCocDeclarations = async (cocRequestId) => {
        if (!cocRequestId) return;
        const declarationTypes = ['construction_complete', 'ready_for_inspection', 'understands_enforcement'];
        for (const declarationType of declarationTypes) {
          const existing = await one(
            client,
            `SELECT id FROM coc_declarations WHERE coc_request_id = $1 AND declaration_type = $2 LIMIT 1`,
            [cocRequestId, declarationType]
          );
          if (!existing) {
            await client.query(
              `INSERT INTO coc_declarations (coc_request_id, declaration_type, accepted, acknowledged_at)
               VALUES ($1, $2, TRUE, NOW() - INTERVAL '15 hours')`,
              [cocRequestId, declarationType]
            );
          }
        }
      };

      await ensureCocDeclarations(cocFeeCalculated?.id || null);
      await ensureCocDeclarations(cocAssigned?.id || null);
      await ensureCocDeclarations(cocInspectionComplete?.id || null);

      // 11) Applicant dashboard gap coverage (fine section, COC ready-for-collection, permit expiry/extendable alerts)
      if (cocFeeCalculated?.id) {
        await client.query(
          `UPDATE coc_requests
           SET status = 'coc-violations-found',
               deviation_fine = 3500,
               violation_report = jsonb_build_object(
                 'deviationType', 'setback-deviation',
                 'isFixable', true,
                 'fineRequired', true,
                 'fineAmount', 3500,
                 'reportedAt', NOW() - INTERVAL '6 hours'
               )
           WHERE id = $1`,
          [cocFeeCalculated.id]
        );
      }

      if (cocInspectionComplete?.id) {
        await client.query(
          `UPDATE coc_requests
           SET status = 'coc-approved',
               approved_by_committee_at = COALESCE(approved_by_committee_at, NOW() - INTERVAL '3 hours')
           WHERE id = $1`,
          [cocInspectionComplete.id]
        );
      }

      if (cocAssigned?.id) {
        await client.query(
          `UPDATE coc_requests
           SET status = 'inspection-complete',
               inspection_completed_at = COALESCE(inspection_completed_at, NOW() - INTERVAL '2 hours')
           WHERE id = $1`,
          [cocAssigned.id]
        );
      }

      const fullCycleApp = await one(
        client,
        `SELECT id FROM applications WHERE project_details->>'seed_key' = 'full-cycle-path' LIMIT 1`
      );

      if (fullCycleApp?.id) {
        await client.query(
          `UPDATE permit_workflow
           SET valid_until = NOW() - INTERVAL '5 days',
               max_years = GREATEST(COALESCE(max_years, 5), 5),
               extensions_used = LEAST(COALESCE(extensions_used, 0), 2),
               updated_at = NOW()
           WHERE application_id = $1`,
          [fullCycleApp.id]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Demo coverage gaps seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
