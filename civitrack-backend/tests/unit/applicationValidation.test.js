const {
  APPLICATION_STATUSES,
  normalizeString,
  isValidApplicationType,
  isValidApplicationStatus,
  getAllowedNextStatuses,
  validateApplicationStatusTransition,
  validateStatusTransition,
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
    expect(isValidApplicationStatus('hold_complaint')).toBe(true);
    expect(isValidApplicationStatus('hold_clearance')).toBe(true);
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

  test('simplified workflow: planning officer cannot skip TO to sw_review_pending', () => {
    const blocked = validateStatusTransition({
      fromStatus: 'under_review',
      toStatus: 'sw_review_pending',
      userRole: 'planning_officer',
      workflow: 'simple',
    });
    expect(blocked.allowed).toBe(false);

    const adminOk = validateStatusTransition({
      fromStatus: 'under_review',
      toStatus: 'sw_review_pending',
      userRole: 'admin',
      workflow: 'simple',
    });
    expect(adminOk.allowed).toBe(true);
  });

  test('legacy workflow: hold statuses transition back to active review', () => {
    const placeComplaintHold = validateApplicationStatusTransition({
      fromStatus: 'under_review',
      toStatus: 'hold_complaint',
      userRole: 'technical_officer',
    });
    expect(placeComplaintHold.allowed).toBe(true);

    const placeClearanceHold = validateApplicationStatusTransition({
      fromStatus: 'under_review',
      toStatus: 'hold_clearance',
      userRole: 'technical_officer',
    });
    expect(placeClearanceHold.allowed).toBe(true);

    const resolveHold = validateApplicationStatusTransition({
      fromStatus: 'hold_clearance',
      toStatus: 'under_review',
      userRole: 'technical_officer',
    });
    expect(resolveHold.allowed).toBe(true);
  });
});
