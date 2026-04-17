const pool = require('../config/db');

const DEFAULT_SW_APP_ID = 4;
const DEFAULT_COMMITTEE_APP_ID = 5;

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {
    swAppId: DEFAULT_SW_APP_ID,
    committeeAppId: DEFAULT_COMMITTEE_APP_ID,
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
    `SELECT id, email, role
     FROM staff_accounts
     WHERE email = $1 AND is_active = TRUE
     LIMIT 1`,
    [email]
  );

  if (byEmail.rows.length) return byEmail.rows[0];

  const byRole = await client.query(
    `SELECT id, email, role
     FROM staff_accounts
     WHERE role = $1 AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
    [role]
  );

  return byRole.rows[0] || null;
};

const getApplication = async (client, applicationId) => {
  const result = await client.query(
    `SELECT id, application_code, status
     FROM applications
     WHERE id = $1`,
    [applicationId]
  );

  return result.rows[0] || null;
};

const getLastSetupHistory = async (client, applicationId) => {
  const result = await client.query(
    `SELECT id, status, changed_at, changed_by, reason, source_stage
     FROM application_status_history
     WHERE application_id = $1
       AND source_stage = 'smoke-setup-script'
     ORDER BY changed_at DESC
     LIMIT 1`,
    [applicationId]
  );

  return result.rows[0] || null;
};

const getPreviousStatusBefore = async (client, applicationId, markerChangedAt) => {
  const result = await client.query(
    `SELECT status, changed_at
     FROM application_status_history
     WHERE application_id = $1
       AND changed_at < $2
     ORDER BY changed_at DESC
     LIMIT 1`,
    [applicationId, markerChangedAt]
  );

  return result.rows[0] || null;
};

const getPreviousAssigneeBefore = async (client, applicationId, markerChangedAt) => {
  const result = await client.query(
    `SELECT aa.assigned_to, sa.email
     FROM application_assignments aa
     LEFT JOIN staff_accounts sa ON sa.id = aa.assigned_to
     WHERE aa.application_id = $1
       AND aa.status = 'reassigned'
       AND aa.completed_at IS NOT NULL
       AND aa.completed_at <= $2
     ORDER BY aa.completed_at DESC, aa.id DESC
     LIMIT 1`,
    [applicationId, markerChangedAt]
  );

  return result.rows[0] || null;
};

const closeOpenAssignments = async (client, applicationId, note) => {
  await client.query(
    `UPDATE application_assignments
     SET status = 'reassigned',
         completed_at = NOW(),
         notes = COALESCE(notes, $2)
     WHERE application_id = $1
       AND status IN ('pending', 'accepted', 'in_progress')`,
    [applicationId, note]
  );
};

const insertPendingAssignment = async (client, applicationId, assignedTo, assignedBy, note) => {
  await client.query(
    `INSERT INTO application_assignments (
      application_id, assigned_to, assigned_by, assignment_type, status, priority, assigned_at, notes
    ) VALUES ($1, $2, $3, 'committee_review', 'pending', 'normal', NOW(), $4)`,
    [applicationId, assignedTo, assignedBy, note]
  );
};

const buildRollbackPlanForApp = async (client, applicationId) => {
  const application = await getApplication(client, applicationId);
  if (!application) {
    throw new Error(`Application id ${applicationId} does not exist.`);
  }

  const setupHistory = await getLastSetupHistory(client, applicationId);
  if (!setupHistory) {
    return {
      applicationId: application.id,
      applicationCode: application.application_code,
      currentStatus: application.status,
      canRollback: false,
      reason: 'No smoke setup marker found for this record.',
    };
  }

  const previousStatus = await getPreviousStatusBefore(client, applicationId, setupHistory.changed_at);
  const previousAssignee = await getPreviousAssigneeBefore(client, applicationId, setupHistory.changed_at);

  return {
    applicationId: application.id,
    applicationCode: application.application_code,
    currentStatus: application.status,
    setupMarker: {
      changedAt: setupHistory.changed_at,
      status: setupHistory.status,
      reason: setupHistory.reason,
    },
    rollbackTarget: {
      status: previousStatus ? previousStatus.status : null,
      assigneeId: previousAssignee ? previousAssignee.assigned_to : null,
      assigneeEmail: previousAssignee ? previousAssignee.email : null,
    },
    canRollback: Boolean(previousStatus),
    warning: previousStatus ? null : 'No previous status exists before setup marker; status will not be changed.',
  };
};

const applyRollbackForApp = async (client, actorId, plan) => {
  if (!plan.canRollback || !plan.rollbackTarget.status) return;

  await client.query(
    `UPDATE applications
     SET status = $2,
         last_updated = NOW()
     WHERE id = $1`,
    [plan.applicationId, plan.rollbackTarget.status]
  );

  await closeOpenAssignments(
    client,
    plan.applicationId,
    'Smoke cleanup: closed active staged assignment.'
  );

  if (plan.rollbackTarget.assigneeId) {
    await insertPendingAssignment(
      client,
      plan.applicationId,
      plan.rollbackTarget.assigneeId,
      actorId,
      'Smoke cleanup: restored previous assignee after test setup.'
    );
  }

  await client.query(
    `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
     VALUES ($1, $2, NOW(), $3, $4, 'smoke-cleanup-script')`,
    [
      plan.applicationId,
      plan.rollbackTarget.status,
      actorId,
      'Smoke cleanup restored record to pre-setup state',
    ]
  );
};

const main = async () => {
  const { swAppId, committeeAppId, apply, force } = parseArgs();

  if (!Number.isInteger(swAppId) || !Number.isInteger(committeeAppId)) {
    throw new Error(
      'Usage: node scripts/cleanup-admin-safe-workflow-records.js [--sw-app-id <id>] [--committee-app-id <id>] [--apply] [--force]'
    );
  }

  const client = await pool.connect();

  try {
    const [swPlan, committeePlan] = await Promise.all([
      buildRollbackPlanForApp(client, swAppId),
      buildRollbackPlanForApp(client, committeeAppId),
    ]);

    const nonTestCodes = [swPlan, committeePlan]
      .filter((item) => !isTestLikeCode(item.applicationCode))
      .map((item) => item.applicationCode);

    if (nonTestCodes.length && !force) {
      throw new Error(
        `Safety check failed: non-test application codes detected (${nonTestCodes.join(', ')}). Re-run with --force if intentional.`
      );
    }

    const actor = await getStaffByEmailOrRole(client, 'technicalofficer@kps.gov.lk', 'technical_officer');
    if (!actor) {
      throw new Error('Required staff account not found (technicalofficer role/email).');
    }

    const plan = {
      mode: apply ? 'apply' : 'dry-run',
      defaults: {
        swAppIdDefault: DEFAULT_SW_APP_ID,
        committeeAppIdDefault: DEFAULT_COMMITTEE_APP_ID,
      },
      safety: {
        forceUsed: force,
        nonTestCodes,
      },
      actor: {
        id: actor.id,
        email: actor.email,
      },
      records: {
        sw: swPlan,
        committee: committeePlan,
      },
    };

    if (!apply) {
      console.log(JSON.stringify(plan, null, 2));
      return;
    }

    await client.query('BEGIN');

    await applyRollbackForApp(client, actor.id, swPlan);
    await applyRollbackForApp(client, actor.id, committeePlan);

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          ...plan,
          applied: true,
        },
        null,
        2
      )
    );
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // Ignore rollback errors so the root cause is preserved.
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
