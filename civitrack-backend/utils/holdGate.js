async function getActiveHoldForApplication({ client, applicationId }) {
  const result = await client.query(
    `SELECT id, hold_type
     FROM application_holds
     WHERE application_id = $1
       AND hold_status = 'active'
     ORDER BY requested_at DESC, id DESC
     LIMIT 1`,
    [applicationId]
  );
  return result.rows[0] || null;
}

async function assertNoActiveHold({
  client,
  applicationId,
  userRole,
  currentStatus,
  requestedStatus,
}) {
  if (userRole === 'admin') return null;

  const activeHold = await getActiveHoldForApplication({ client, applicationId });
  if (!activeHold) return null;

  const error = new Error('Application workflow is paused due to an active hold. Resolve the hold before advancing.');
  error.httpStatus = 409;
  error.payload = {
    error: error.message,
    code: 'APPLICATION_ON_HOLD',
    hold: activeHold,
    currentStatus,
    requestedStatus,
  };
  throw error;
}

module.exports = {
  getActiveHoldForApplication,
  assertNoActiveHold,
};

