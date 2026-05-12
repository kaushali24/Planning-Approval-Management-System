const request = require('supertest');

describe('simple dashboard advance hold gate integration', () => {
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

  test('blocks non-admin advance when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 10, role: 'committee', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 55, status: 'endorsed', applicant_id: 1, application_code: 'BD/2026/00055' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 11, hold_type: 'complaint' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/55/advance')
      .send({
        status: 'approved',
        notes: '',
        decisionMeta: {
          decisionNo: 'CD-2026-001',
          meetingDate: '2026-04-27',
          decisionReason: 'Administrative override approval for data correction.',
        },
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'APPLICATION_ON_HOLD',
        currentStatus: 'endorsed',
        requestedStatus: 'approved_awaiting_agreement',
      })
    );
  });

  test('allows admin advance even when active hold exists', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 99, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications') && sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 55, status: 'endorsed', applicant_id: 1, application_code: 'BD/2026/00055' }] };
        }
        if (sql.includes('FROM application_holds') && sql.includes("hold_status = 'active'")) {
          return { rows: [{ id: 11, hold_type: 'complaint' }] };
        }
        if (sql.includes('UPDATE applications')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO application_status_history')) {
          return { rows: [] };
        }
        if (sql.trim().startsWith('BEGIN') || sql.trim().startsWith('COMMIT')) {
          return { rows: [] };
        }
        // after COMMIT advanceApplication sends email; we ignore those queries by returning empty
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/simple/applications/55/advance')
      .send({
        status: 'approved',
        notes: '',
        decisionMeta: {
          decisionNo: 'CD-2026-001',
          meetingDate: '2026-04-27',
          decisionReason: 'Administrative override approval for data correction.',
        },
      });

    expect(response.status).toBe(200);
  });
});

