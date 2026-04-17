const request = require('supertest');

describe('appeals integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl, poolConnectQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user;
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

  test('GET /api/appeals validates invalid page query', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/api/appeals?page=0');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          path: '/api/appeals?page=0',
          method: 'GET',
        }),
      })
    );
  });

  test('POST /api/appeals rejects applicant creating appeal for another application', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 77, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('SELECT id FROM applications WHERE id = $1 AND applicant_id = $2')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .post('/api/appeals')
      .send({
        application_id: 1001,
        route: 'committee',
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTH_FORBIDDEN',
          message: 'You can only create appeals for your own applications',
        }),
      })
    );
  });

  test('POST /api/appeals returns 409 when appeal case already exists', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 11, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('SELECT id FROM applications WHERE id = $1 AND applicant_id = $2')) {
          return { rows: [{ id: 200 }] };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return { rows: [] };
        }

        if (sql.includes('SELECT id FROM appeal_cases WHERE application_id = $1')) {
          return { rows: [{ id: 1 }] };
        }

        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/appeals')
      .send({
        application_id: 200,
        route: 'committee',
      });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'APPEAL_ALREADY_EXISTS',
          message: 'Appeal case already exists for this application',
        }),
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('GET /api/appeals/:id returns 404 when appeal case is missing', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 1, role: 'committee', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM appeal_cases ac')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/api/appeals/999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'APPEAL_NOT_FOUND',
          message: 'Appeal case not found',
        }),
      })
    );
  });

  test('PATCH /api/appeals/:id/status rejects invalid status values', async () => {
    const { app, pool, mockClient } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .patch('/api/appeals/55/status')
      .send({ status: 'invalid-status' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('Invalid status. Allowed:'),
        }),
      })
    );
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
  });
});
