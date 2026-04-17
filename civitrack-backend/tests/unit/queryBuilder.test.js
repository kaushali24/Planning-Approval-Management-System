const {
  parseSortParam,
  isValidDate,
  buildFilterConditions,
  buildWhereClause,
  buildOrderByClause,
  buildPaginationClause,
} = require('../../utils/queryBuilder');

describe('queryBuilder utility', () => {
  test('parses valid sort parameters and applies default', () => {
    expect(parseSortParam('status:ASC')).toEqual({
      field: 'a.status',
      direction: 'ASC',
    });

    expect(parseSortParam()).toEqual({
      field: 'a.submission_date',
      direction: 'DESC',
    });
  });

  test('throws on invalid sort parameter', () => {
    expect(() => parseSortParam('unknown:ASC')).toThrow(/invalid sort field/i);
    expect(() => parseSortParam('status:INVALID')).toThrow(/sort direction/i);
  });

  test('validates date format', () => {
    expect(isValidDate('2026-03-29')).toBe(true);
    expect(isValidDate('2026/03/29')).toBe(false);
    expect(isValidDate('invalid')).toBe(false);
  });

  test('builds filter conditions and params safely', () => {
    const { whereConditions, params } = buildFilterConditions(
      {
        searchQuery: 'Nimal',
        status: 'submitted',
        type: 'building',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      },
      { baseParams: [99] }
    );

    expect(params).toEqual([
      99,
      '%Nimal%',
      'submitted',
      'building',
      '2026-01-01',
      '2026-01-31',
    ]);
    expect(whereConditions.length).toBe(5);
    expect(buildWhereClause(whereConditions)).toMatch(/^ WHERE /);
  });

  test('builds order and pagination clauses', () => {
    expect(buildOrderByClause({ field: 'a.status', direction: 'DESC' })).toBe(' ORDER BY a.status DESC');
    expect(buildOrderByClause(null)).toBe(' ORDER BY a.submission_date DESC');

    const paginated = buildPaginationClause(20, 40, ['x']);
    expect(paginated.clause).toBe(' LIMIT $2 OFFSET $3');
    expect(paginated.params).toEqual(['x', 20, 40]);
  });
});
