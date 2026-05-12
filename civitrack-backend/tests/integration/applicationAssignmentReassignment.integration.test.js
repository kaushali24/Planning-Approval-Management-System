const request = require('supertest');

describe('application reassignment note enforcement integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl, poolConnectQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user || { userId: 1, role: 'planning_officer', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const queryImpl = poolQueryImpl || (async () => ({ rows: [] }));
    const connectQueryImpl = poolConnectQueryImpl || queryImpl;

    const mockClient = {
      query: jest.fn(connectQueryImpl),
      release: jest.fn(),
    };

    const pool = {
      query: jest.fn(queryImpl),
      connect: jest.fn(async () => mockClient),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app, pool, mockClient };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('POST /api/applications/:id/assign requires note for reassignment', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async (sql) => {
        if (sql.includes('SELECT id, status FROM applications')) {
          return { rows: [{ id: 55, status: 'under_review' }] };
        }
        if (sql.includes('FROM staff_accounts') && sql.includes('WHERE id = $1')) {
          return { rows: [{ id: 12, full_name: 'TO New' }] };
        }
        if (sql.includes('SELECT id, assigned_to FROM application_assignments')) {
          return { rows: [{ id: 9, assigned_to: 10 }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/55/assign')
      .send({ assigned_to: '12', notes: 'no' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'REASSIGNMENT_NOTE_REQUIRED',
      })
    );
  });

  test('POST /api/applications/batch/assign requires note for reassignment', async () => {
    const { app } = loadAppWithMocks({
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM staff_accounts') && sql.includes('WHERE id = ANY')) {
          return { rows: [{ id: 12 }] };
        }
        if (sql.includes('FROM staff_accounts') && sql.includes('WHERE id = $1')) {
          return { rows: [{ id: 12, full_name: 'TO New' }] };
        }
        if (sql.includes('FROM staff_accounts') && sql.includes('staff_id = $1')) {
          return { rows: [{ id: 12, full_name: 'TO New' }] };
        }
        if (sql.includes('SELECT id FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 55 }] };
        }
        if (sql.includes('SELECT id, assigned_to FROM application_assignments')) {
          return { rows: [{ id: 9, assigned_to: 10 }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/batch/assign')
      .send({
        assignments: [{ applicationId: 55, assignedTo: '12', notes: 'no' }],
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        failureCount: 1,
        results: expect.arrayContaining([
          expect.objectContaining({
            applicationId: 55,
            code: 'REASSIGNMENT_NOTE_REQUIRED',
          }),
        ]),
      })
    );
  });
});

