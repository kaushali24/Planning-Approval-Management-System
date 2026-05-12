const request = require('supertest');

describe('batch operations transaction safety integration', () => {
  const loadAppWithMocks = ({ clientQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = { userId: 99, role: 'planning_officer', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const mockClient = {
      query: jest.fn(clientQueryImpl),
      release: jest.fn(),
    };

    const pool = {
      query: jest.fn(async () => ({ rows: [] })),
      connect: jest.fn(async () => mockClient),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app, mockClient };
  };

  afterEach(() => {
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('rolls back full batch when one update fails validation', async () => {
    const { app, mockClient } = loadAppWithMocks({
      clientQueryImpl: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT * FROM applications WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: params[0], status: 'submitted' }] };
        }
        if (sql.includes('UPDATE applications')) return { rows: [] };
        if (sql.includes('INSERT INTO application_status_history')) return { rows: [] };
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/applications/batch/status-updates')
      .send({
        updates: [
          { applicationId: 1, newStatus: 'under_review', notes: 'ok-note' },
          { applicationId: 2, newStatus: 'rejected', notes: 'bad' },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/rolled back/i);
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
  });
});
