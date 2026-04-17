const pool = require('../config/db');

const normalizeKey = (value) => (value || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
const DEFAULT_FEE_CONFIG = [
  {
    fee_type: 'building_permit',
    display_name: 'Building Permit',
    amount: 5000,
  },
  {
    fee_type: 'land_subdivision',
    display_name: 'Land Subdivision',
    amount: 7500,
  },
];

const ensureFeeConfigTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS admin_fee_config (
      id SERIAL PRIMARY KEY,
      fee_type VARCHAR(100) UNIQUE NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by INT REFERENCES staff_accounts(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  );

  for (const fee of DEFAULT_FEE_CONFIG) {
    await pool.query(
      `INSERT INTO admin_fee_config (fee_type, display_name, amount, is_active, updated_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (fee_type) DO NOTHING`,
      [fee.fee_type, fee.display_name, fee.amount]
    );
  }
};

exports.getDocumentChecklistConfig = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, doc_type_key, display_name, description, is_required, is_active, sort_order, updated_at
       FROM document_checklist_config
       ORDER BY sort_order ASC, id ASC`
    );

    return res.json({ items: result.rows });
  } catch (error) {
    console.error('Get document checklist config error:', error);
    return res.status(500).json({ error: 'Failed to fetch document checklist configuration' });
  }
};

exports.upsertDocumentChecklistItem = async (req, res) => {
  try {
    const { key } = req.params;
    const normalizedKey = normalizeKey(key);
    const { displayName, description, isRequired, isActive, sortOrder } = req.body;
    const changedBy = req.user?.userId || null;

    if (!normalizedKey) {
      return res.status(400).json({ error: 'Invalid document key' });
    }

    if (!displayName || !displayName.toString().trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }

    const result = await pool.query(
      `INSERT INTO document_checklist_config
         (doc_type_key, display_name, description, is_required, is_active, sort_order, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (doc_type_key)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = EXCLUDED.description,
         is_required = EXCLUDED.is_required,
         is_active = EXCLUDED.is_active,
         sort_order = EXCLUDED.sort_order,
         updated_at = NOW()
       RETURNING id, doc_type_key, display_name, description, is_required, is_active, sort_order, updated_at`,
      [
        normalizedKey,
        displayName.toString().trim(),
        description ? description.toString().trim() : null,
        isRequired === true,
        isActive !== false,
        Number.isInteger(sortOrder) ? sortOrder : 100,
      ]
    );

    await pool.query(
      `INSERT INTO document_checklist_audit_log (doc_type_key, changed_by, change_summary)
       VALUES ($1, $2, $3)`,
      [
        normalizedKey,
        changedBy,
        JSON.stringify({
          displayName,
          description: description || null,
          isRequired: isRequired === true,
          isActive: isActive !== false,
          sortOrder: Number.isInteger(sortOrder) ? sortOrder : 100,
        }),
      ]
    );

    return res.json({
      message: 'Document checklist configuration updated successfully',
      item: result.rows[0],
    });
  } catch (error) {
    console.error('Upsert document checklist item error:', error);
    return res.status(500).json({ error: 'Failed to update document checklist configuration' });
  }
};

exports.getAdminOverviewStats = async (req, res) => {
  try {
    const [applicationsResult, activeStaffResult, pendingReviewsResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM applications'),
      pool.query("SELECT COUNT(*)::int AS count FROM staff_accounts WHERE is_active = TRUE AND role <> 'admin'"),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM applications
         WHERE status NOT IN ('approved', 'rejected', 'withdrawn', 'permit-issued', 'closed')`
      ),
    ]);

    const totalApplications = Number(applicationsResult.rows[0]?.count || 0);
    const activeStaff = Number(activeStaffResult.rows[0]?.count || 0);
    const pendingReviews = Number(pendingReviewsResult.rows[0]?.count || 0);
    const systemHealth = 100;

    return res.json({
      stats: {
        totalApplications,
        activeStaff,
        pendingReviews,
        systemHealth,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get admin overview stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch admin overview stats' });
  }
};

exports.getSystemLogs = async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 50, 200);

    const result = await pool.query(
      `SELECT *
       FROM (
         SELECT
           'application_status'::text AS category,
           ash.id::text AS event_id,
           ash.changed_at AS occurred_at,
           CONCAT('Application ', COALESCE(a.application_code, CONCAT('APP#', a.id::text)), ' moved to ', ash.status) AS message,
           ash.status AS status,
           ash.reason AS details,
           sa.full_name AS actor_name
         FROM application_status_history ash
         JOIN applications a ON a.id = ash.application_id
         LEFT JOIN staff_accounts sa ON sa.id = ash.changed_by

         UNION ALL

         SELECT
           'document_checklist'::text AS category,
           dcal.id::text AS event_id,
           dcal.changed_at AS occurred_at,
           CONCAT('Checklist item ', dcal.doc_type_key, ' updated') AS message,
           NULL::text AS status,
           dcal.change_summary::text AS details,
           sa.full_name AS actor_name
         FROM document_checklist_audit_log dcal
         LEFT JOIN staff_accounts sa ON sa.id = dcal.changed_by
       ) logs
       ORDER BY occurred_at DESC
       LIMIT $1`,
      [limit]
    );

    return res.json({
      logs: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error('Get system logs error:', error);
    return res.status(500).json({ error: 'Failed to fetch system logs' });
  }
};

exports.getFeeConfiguration = async (req, res) => {
  try {
    await ensureFeeConfigTable();

    const result = await pool.query(
      `SELECT id, fee_type, display_name, amount, is_active, updated_by, updated_at
       FROM admin_fee_config
       ORDER BY id ASC`
    );

    return res.json({ fees: result.rows });
  } catch (error) {
    console.error('Get fee configuration error:', error);
    return res.status(500).json({ error: 'Failed to fetch fee configuration' });
  }
};

exports.updateFeeConfigurationItem = async (req, res) => {
  try {
    await ensureFeeConfigTable();

    const feeType = normalizeKey(req.params.feeType);
    const amount = Number(req.body.amount);
    const actorId = req.user?.userId || null;

    if (!feeType) {
      return res.status(400).json({ error: 'Invalid fee type' });
    }

    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'amount must be a valid non-negative number' });
    }

    const result = await pool.query(
      `UPDATE admin_fee_config
       SET amount = $1,
           updated_by = $2,
           updated_at = NOW()
       WHERE fee_type = $3
       RETURNING id, fee_type, display_name, amount, is_active, updated_by, updated_at`,
      [amount, actorId, feeType]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Fee configuration entry not found' });
    }

    return res.json({
      message: 'Fee configuration updated successfully',
      fee: result.rows[0],
    });
  } catch (error) {
    console.error('Update fee configuration error:', error);
    return res.status(500).json({ error: 'Failed to update fee configuration' });
  }
};
