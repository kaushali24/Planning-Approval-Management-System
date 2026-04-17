const pool = require('../config/db');

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    swAppId: null,
    committeeAppId: null,
    apply: false,
    force: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--sw-app-id') parsed.swAppId = Number(args[i + 1]);
    if (arg === '--committee-app-id') parsed.committeeAppId = Number(args[i + 1]);
    if (arg === '--apply') parsed.apply = true;
    if (arg === '--force') parsed.force = true;
  }

  return parsed;
};

const isTestLikeCode = (code = '') => /^(SMK|TEST|DEMO|QA)-/i.test(code);

const getStaffByEmailOrRole = async (client, email, role) => {
  const byEmail = await client.query(
    `SELECT id, staff_id, full_name, email, role
     FROM staff_accounts
     WHERE email = $1 AND is_active = TRUE
     LIMIT 1`,
    [email]
  );
  if (byEmail.rows.length) return byEmail.rows[0];

  const byRole = await client.query(
    `SELECT id, staff_id, full_name, email, role
     FROM staff_accounts
     WHERE role = $1 AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
    [role]
  );
  return byRole.rows[0] || null;
};

const upsertActiveAssignment = async (client, applicationId, assignedTo, assignedBy, notes) => {
  await client.query(
    `UPDATE application_assignments
     SET status = 'reassigned', completed_at = NOW(), notes = COALESCE(notes, $2)
     WHERE application_id = $1 AND status IN ('pending', 'accepted', 'in_progress')`,
    [applicationId, notes]
  );

  await client.query(
    `INSERT INTO application_assignments (
      application_id, assigned_to, assigned_by, assignment_type, status, priority, assigned_at, notes
    ) VALUES ($1, $2, $3, 'committee_review', 'pending', 'normal', NOW(), $4)`,
    [applicationId, assignedTo, assignedBy, notes]
  );
};

const ensureInspection = async (client, applicationId, technicalOfficerId, summary) => {
  const exists = await client.query(
    `SELECT id FROM inspections WHERE application_id = $1 ORDER BY id DESC LIMIT 1`,
    [applicationId]
  );

  if (exists.rows.length) {
    await client.query(
      `UPDATE inspections
       SET staff_id = COALESCE(staff_id, $2),
           observations = COALESCE(NULLIF(observations, ''), $3),
           recommendation = COALESCE(recommendation, 'approve')
       WHERE id = $1`,
      [exists.rows[0].id, technicalOfficerId, summary]
    );
    return;
  }

  await client.query(
    `INSERT INTO inspections (application_id, staff_id, scheduled_date, result, observations, recommendation, created_at)
     VALUES ($1, $2, NOW(), 'compliant', $3, 'approve', NOW())`,
    [applicationId, technicalOfficerId, summary]
  );
};

const main = async () => {
  const { swAppId, committeeAppId, apply, force } = parseArgs();

  if (!Number.isInteger(swAppId) || !Number.isInteger(committeeAppId)) {
    throw new Error('Usage: node scripts/setup-admin-safe-workflow-records.js --sw-app-id <id> --committee-app-id <id> [--apply] [--force]');
  }

  const client = await pool.connect();
  try {
    const [swAppRes, committeeAppRes] = await Promise.all([
      client.query('SELECT id, application_code, status FROM applications WHERE id = $1', [swAppId]),
      client.query('SELECT id, application_code, status FROM applications WHERE id = $1', [committeeAppId]),
    ]);

    if (!swAppRes.rows.length || !committeeAppRes.rows.length) {
      throw new Error('One or both application ids do not exist.');
    }

    const swApp = swAppRes.rows[0];
    const committeeApp = committeeAppRes.rows[0];

    const nonTest = [swApp, committeeApp].filter((row) => !isTestLikeCode(row.application_code));
    if (nonTest.length && !force) {
      throw new Error(
        `Safety check failed: non-test application codes detected (${nonTest.map((r) => r.application_code).join(', ')}). Re-run with --force if intentional.`
      );
    }

    const technicalOfficer = await getStaffByEmailOrRole(client, 'technicalofficer@kps.gov.lk', 'technical_officer');
    const superintendent = await getStaffByEmailOrRole(client, 'superintendent@kps.gov.lk', 'superintendent');
    const committee = await getStaffByEmailOrRole(client, 'committee@kps.gov.lk', 'committee');

    if (!technicalOfficer || !superintendent || !committee) {
      throw new Error('Required staff accounts not found (technicalofficer/superintendent/committee).');
    }

    const plan = {
      mode: apply ? 'apply' : 'dry-run',
      safety: { forceUsed: force, nonTestCodes: nonTest.map((r) => r.application_code) },
      records: {
        sw: {
          applicationId: swApp.id,
          applicationCode: swApp.application_code,
          fromStatus: swApp.status,
          toStatus: 'committee_review',
          assignTo: superintendent.email,
        },
        committee: {
          applicationId: committeeApp.id,
          applicationCode: committeeApp.application_code,
          fromStatus: committeeApp.status,
          toStatus: 'endorsed',
          assignTo: committee.email,
        },
      },
    };

    if (!apply) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE applications SET status = 'committee_review', last_updated = NOW() WHERE id = $1`,
      [swApp.id]
    );
    await client.query(
      `UPDATE applications SET status = 'endorsed', last_updated = NOW() WHERE id = $1`,
      [committeeApp.id]
    );

    await ensureInspection(client, swApp.id, technicalOfficer.id, 'Smoke setup: SW-ready inspection summary.');
    await ensureInspection(client, committeeApp.id, technicalOfficer.id, 'Smoke setup: Committee-ready endorsed inspection summary.');

    await upsertActiveAssignment(
      client,
      swApp.id,
      superintendent.id,
      technicalOfficer.id,
      'Smoke setup: assigned to Superintendent for refer-back path.'
    );
    await upsertActiveAssignment(
      client,
      committeeApp.id,
      committee.id,
      technicalOfficer.id,
      'Smoke setup: assigned to Committee for approve path.'
    );

    await client.query(
      `UPDATE application_holds SET hold_status = 'resolved', resolved_at = NOW()
       WHERE application_id IN ($1, $2) AND hold_status = 'active'`,
      [swApp.id, committeeApp.id]
    );

    await client.query(
      `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
       VALUES
         ($1, 'committee_review', NOW(), $3, 'Smoke setup moved record to SW-ready state', 'smoke-setup-script'),
         ($2, 'endorsed', NOW(), $3, 'Smoke setup moved record to Committee-ready state', 'smoke-setup-script')`,
      [swApp.id, committeeApp.id, technicalOfficer.id]
    );

    await client.query('COMMIT');

    console.log(JSON.stringify({
      ...plan,
      applied: true,
      staff: {
        technicalOfficer: technicalOfficer.email,
        superintendent: superintendent.email,
        committee: committee.email,
      },
    }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors to preserve root cause.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
