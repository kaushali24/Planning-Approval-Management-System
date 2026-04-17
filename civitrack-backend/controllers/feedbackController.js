const pool = require('../config/db');
const { sendError } = require('../middleware/errorHandler');

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const submitFeedback = async (req, res) => {
  const { name, email, subject, message } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertFeedback = await client.query(
      `INSERT INTO feedback_submissions (citizen_name, citizen_email, subject, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, citizen_name, citizen_email, subject, message, status, submitted_at`,
      [name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim()]
    );

    const feedback = insertFeedback.rows[0];

    await client.query(
      `INSERT INTO feedback_staff_inbox (feedback_id, staff_id)
       SELECT $1, sa.id
       FROM staff_accounts sa
       WHERE sa.is_active = TRUE`,
      [feedback.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('submitFeedback error:', error);
    return sendError(res, 500, 'Failed to submit feedback', {
      code: 'FEEDBACK_CREATE_FAILED',
      details: error.message,
    });
  } finally {
    client.release();
  }
};

const getFeedbackInbox = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { status, q } = req.query;
  const userId = req.user?.userId;

  if (!userId) {
    return sendError(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
  }

  try {
    let filterSql = 'WHERE fi.staff_id = $1';
    const params = [userId];

    if (status) {
      params.push(status);
      filterSql += ` AND fs.status = $${params.length}`;
    }

    if (q && q.trim()) {
      params.push(`%${q.trim()}%`);
      filterSql += ` AND (fs.subject ILIKE $${params.length} OR fs.message ILIKE $${params.length} OR fs.citizen_name ILIKE $${params.length})`;
    }

    const countQuery = `
      SELECT COUNT(*)::INT AS total
      FROM feedback_staff_inbox fi
      INNER JOIN feedback_submissions fs ON fs.id = fi.feedback_id
      ${filterSql}
    `;

    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    const dataParams = [...params, limit, offset];
    const dataQuery = `
      SELECT
        fs.id,
        fs.citizen_name,
        fs.citizen_email,
        fs.subject,
        fs.message,
        fs.status,
        fs.submitted_at,
        fi.is_read,
        fi.delivered_at,
        fi.read_at
      FROM feedback_staff_inbox fi
      INNER JOIN feedback_submissions fs ON fs.id = fi.feedback_id
      ${filterSql}
      ORDER BY fi.is_read ASC, fs.submitted_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;

    const feedbackResult = await pool.query(dataQuery, dataParams);

    return res.json({
      success: true,
      feedback: feedbackResult.rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    console.error('getFeedbackInbox error:', error);
    return sendError(res, 500, 'Failed to fetch feedback inbox', {
      code: 'FEEDBACK_FETCH_FAILED',
      details: error.message,
    });
  }
};

const markFeedbackAsRead = async (req, res) => {
  const feedbackId = Number(req.params.id);
  const userId = req.user?.userId;

  if (!userId) {
    return sendError(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
  }

  try {
    const result = await pool.query(
      `UPDATE feedback_staff_inbox
       SET is_read = TRUE,
           read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE feedback_id = $1 AND staff_id = $2
       RETURNING feedback_id, staff_id, is_read, read_at`,
      [feedbackId, userId]
    );

    if (!result.rows.length) {
      return sendError(res, 404, 'Feedback entry not found for this staff account', {
        code: 'FEEDBACK_NOT_FOUND',
      });
    }

    return res.json({
      success: true,
      message: 'Feedback marked as read',
      item: result.rows[0],
    });
  } catch (error) {
    console.error('markFeedbackAsRead error:', error);
    return sendError(res, 500, 'Failed to mark feedback as read', {
      code: 'FEEDBACK_MARK_READ_FAILED',
      details: error.message,
    });
  }
};

const getFeedbackSummary = async (req, res) => {
  const userId = req.user?.userId;

  if (!userId) {
    return sendError(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
  }

  try {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE fi.is_read = FALSE)::INT AS unread_count,
        COUNT(*)::INT AS total_count
      FROM feedback_staff_inbox fi
      WHERE fi.staff_id = $1`,
      [userId]
    );

    const row = result.rows[0] || { unread_count: 0, total_count: 0 };

    return res.json({
      success: true,
      summary: {
        unreadCount: row.unread_count || 0,
        totalCount: row.total_count || 0,
      },
    });
  } catch (error) {
    console.error('getFeedbackSummary error:', error);
    return sendError(res, 500, 'Failed to fetch feedback summary', {
      code: 'FEEDBACK_SUMMARY_FAILED',
      details: error.message,
    });
  }
};

module.exports = {
  submitFeedback,
  getFeedbackInbox,
  markFeedbackAsRead,
  getFeedbackSummary,
};
