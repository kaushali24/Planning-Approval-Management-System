/**
 * Query Builder utility for dynamic filtering and sorting
 * Supports safe construction of WHERE, ORDER BY clauses with parameterized queries
 */

const ALLOWED_SORT_FIELDS = {
  submission_date: 'a.submission_date',
  status: 'a.status',
  type: 'a.application_type',
  applicant_name: 'a.submitted_applicant_name',
  updated: 'a.last_updated',
};

const DEFAULT_SORT = 'submission_date:DESC';

/**
 * Parses and validates sort parameter
 * Format: "field:ASC|DESC"
 * @param {string} sortParam - Sort parameter from query
 * @returns {object} - { field: string, direction: 'ASC'|'DESC' }
 */
function parseSortParam(sortParam) {
  if (!sortParam) {
    const [defaultField, defaultDirection] = DEFAULT_SORT.split(':');
    return { field: ALLOWED_SORT_FIELDS[defaultField], direction: defaultDirection };
  }

  const [field, direction] = sortParam.split(':');

  if (!field || !ALLOWED_SORT_FIELDS[field]) {
    throw new Error(`Invalid sort field. Allowed: ${Object.keys(ALLOWED_SORT_FIELDS).join(', ')}`);
  }

  if (!['ASC', 'DESC'].includes(direction)) {
    throw new Error('Sort direction must be ASC or DESC');
  }

  return { field: ALLOWED_SORT_FIELDS[field], direction };
}

/**
 * Validates date string (ISO format: YYYY-MM-DD)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const date = new Date(`${dateStr}T00:00:00Z`);
  return date instanceof Date && !isNaN(date);
}

/**
 * Builds WHERE clause conditions and params array for filtering
 * @param {object} filters - { searchQuery, status, type, fromDate, toDate }
 * @param {object} options - { baseParams: [], userRole, userId, assignedTo }
 * @returns {object} - { whereConditions: string[], params: [] }
 */
function buildFilterConditions(filters, options = {}) {
  const { searchQuery, status, type, fromDate, toDate } = filters;
  const { baseParams = [], userRole, userId, assignedTo } = options;

  let conditions = [];
  let params = [...baseParams];

  // Search by applicant name (case-insensitive, partial match)
  if (searchQuery && searchQuery.trim()) {
    conditions.push(`LOWER(a.submitted_applicant_name) LIKE LOWER($${params.length + 1})`);
    params.push(`%${searchQuery.trim()}%`);
  }

  // Filter by status
  if (status) {
    conditions.push(`a.status = $${params.length + 1}`);
    params.push(status);
  }

  // Filter by application type
  if (type) {
    conditions.push(`a.application_type = $${params.length + 1}`);
    params.push(type);
  }

  // Date range filtering
  if (fromDate) {
    conditions.push(`a.submission_date >= $${params.length + 1}::DATE`);
    params.push(fromDate);
  }

  if (toDate) {
    // Add 1 day to include entire end date
    conditions.push(`a.submission_date < ($${params.length + 1}::DATE + INTERVAL '1 day')`);
    params.push(toDate);
  }

  return { whereConditions: conditions, params };
}

/**
 * Builds complete WHERE clause string
 * @param {string[]} conditions - Array of WHERE condition strings
 * @param {string} prefix - Optional prefix like "WHERE" (default: "WHERE")
 * @returns {string}
 */
function buildWhereClause(conditions, prefix = 'WHERE') {
  return conditions.length > 0 ? ` ${prefix} ${conditions.join(' AND ')}` : '';
}

/**
 * Builds ORDER BY clause
 * @param {object} sort - { field, direction }
 * @param {string} defaultSort - Default sort if not provided (e.g., "a.field DESC")
 * @returns {string}
 */
function buildOrderByClause(sort, defaultSort = 'a.submission_date DESC') {
  if (!sort || !sort.field) {
    return ` ORDER BY ${defaultSort}`;
  }
  return ` ORDER BY ${sort.field} ${sort.direction}`;
}

/**
 * Builds LIMIT OFFSET clause for pagination
 * @param {number} limit - Records per page
 * @param {number} offset - Records to skip
 * @param {array} params - Parameters array to append to
 * @returns {object} - { clause: string, params: updatedParams }
 */
function buildPaginationClause(limit, offset, params = []) {
  const newParams = [...params, limit, offset];
  return {
    clause: ` LIMIT $${newParams.length - 1} OFFSET $${newParams.length}`,
    params: newParams,
  };
}

module.exports = {
  parseSortParam,
  isValidDate,
  buildFilterConditions,
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
  ALLOWED_SORT_FIELDS,
  DEFAULT_SORT,
};
