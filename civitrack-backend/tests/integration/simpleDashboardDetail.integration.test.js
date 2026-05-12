const request = require('supertest');

describe('simple dashboard detail contract integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user || { userId: 10, role: 'planning_officer', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const pool = {
      query: jest.fn(poolQueryImpl),
      connect: jest.fn(async () => ({
        query: jest.fn(poolQueryImpl),
        release: jest.fn(),
      })),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('returns simple application detail with required slices', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async (sql) => {
        if (sql.includes('SELECT * FROM v_simple_applications')) {
          return { rows: [{ id: 55, applicant_id: 10, status: 'under_review', application_code: 'BD/2026/00055' }] };
        }
        if (sql.includes('FROM documents')) {
          return { rows: [{ id: 1, doc_type: 'deed', file_url: 'uploads/a.pdf' }] };
        }
        if (sql.includes('FROM application_status_history')) {
          return { rows: [{ id: 99, status: 'submitted' }] };
        }
        if (sql.includes('FROM application_assignments')) {
          return { rows: [{ id: 5, assigned_to: 2, status: 'in_progress' }] };
        }
        if (sql.includes('FROM inspections')) {
          return { rows: [{ id: 7, result: 'pending' }] };
        }
        if (sql.includes('FROM application_holds')) {
          return { rows: [{ id: 11, hold_type: 'complaint', hold_status: 'active', reason: 'Test hold' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app).get('/api/simple/applications/55');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: 55,
        documents: expect.any(Array),
        history: expect.any(Array),
        assignments: expect.any(Array),
        inspections: expect.any(Array),
        holds: expect.any(Array),
      })
    );
  });
});
