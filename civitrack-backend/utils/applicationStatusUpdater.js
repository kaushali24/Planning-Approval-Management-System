async function applyStatusTransition({
  client,
  applicationId,
  toStatus,
  changedBy = null,
  reason = null,
  sourceStage = null,
  returnApplication = false,
}) {
  const updateSql = returnApplication
    ? `UPDATE applications
       SET status = $1, last_updated = NOW()
       WHERE id = $2
       RETURNING *`
    : `UPDATE applications
       SET status = $1, last_updated = NOW()
       WHERE id = $2`;

  const updateResult = await client.query(updateSql, [toStatus, applicationId]);

  await client.query(
    `INSERT INTO application_status_history (application_id, status, changed_at, changed_by, reason, source_stage)
     VALUES ($1, $2, NOW(), $3, $4, $5)`,
    [applicationId, toStatus, changedBy, reason, sourceStage]
  );

  return returnApplication ? updateResult.rows[0] || null : null;
}

module.exports = {
  applyStatusTransition,
};

