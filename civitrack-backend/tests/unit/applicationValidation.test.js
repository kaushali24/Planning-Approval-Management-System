const {
  APPLICATION_STATUSES,
  normalizeString,
  isValidApplicationType,
  isValidApplicationStatus,
  getAllowedNextStatuses,
  validateApplicationStatusTransition,
} = require('../../utils/applicationValidation');

describe('applicationValidation utility', () => {
  test('normalizes strings safely', () => {
    expect(normalizeString('  hello  ')).toBe('hello');
    expect(normalizeString(null)).toBeNull();
    expect(normalizeString(123)).toBe(123);
  });

  test('validates application types and statuses', () => {
    expect(isValidApplicationType('building')).toBe(true);
    expect(isValidApplicationType('invalid-type')).toBe(false);

    expect(isValidApplicationStatus('submitted')).toBe(true);
    expect(isValidApplicationStatus('not-a-status')).toBe(false);
    expect(APPLICATION_STATUSES).toContain('draft');
  });

  test('returns allowed next statuses by role and workflow', () => {
    const planningAllowed = getAllowedNextStatuses('submitted', 'planning_officer');
    expect(planningAllowed).toEqual(expect.arrayContaining(['under_review', 'correction']));
    expect(planningAllowed).not.toContain('approved');

    const adminAllowed = getAllowedNextStatuses('submitted', 'admin');
    expect(adminAllowed.length).toBeGreaterThan(5);
    expect(adminAllowed).toContain('approved');
  });

  test('validates transition rules including role checks', () => {
    const sameStatus = validateApplicationStatusTransition({
      fromStatus: 'submitted',
      toStatus: 'submitted',
      userRole: 'planning_officer',
    });
    expect(sameStatus.allowed).toBe(false);

    const invalidRoleTransition = validateApplicationStatusTransition({
      fromStatus: 'submitted',
      toStatus: 'approved',
      userRole: 'planning_officer',
    });
    expect(invalidRoleTransition.allowed).toBe(false);
    expect(invalidRoleTransition.reason).toMatch(/not allowed/i);

    const validTransition = validateApplicationStatusTransition({
      fromStatus: 'submitted',
      toStatus: 'under_review',
      userRole: 'planning_officer',
    });
    expect(validTransition.allowed).toBe(true);
  });
});
