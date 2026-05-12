const request = require('supertest');

describe('coc integration', () => {
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

  test('GET /api/coc-requests validates invalid page query', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/api/coc-requests?page=0');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
        }),
      })
    );
  });

  test('POST /api/coc-requests rejects applicant creating request for another application', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 77, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications')) {
          return {
            rows: [{ id: 1001, applicant_id: 55, status: 'submitted', application_type: 'building' }],
          };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .post('/api/coc-requests')
      .send({ application_id: 1001 });

    expect(response.status).toBe(403);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTH_FORBIDDEN',
          message: 'You can only create COC requests for your own applications',
        }),
      })
    );
  });

  test('POST /api/coc-requests returns 409 when COC already exists', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 11, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications')) {
          return {
            rows: [{
              id: 200,
              applicant_id: 11,
              status: 'permit_collected',
              application_type: 'building',
              submitted_applicant_name: 'Paboda',
              submitted_email: 'pabodakaushali2001@gmail.com',
            }],
          };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('SELECT id FROM coc_requests WHERE application_id = $1')) {
          return { rows: [{ id: 1 }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/coc-requests')
      .send({ application_id: 200 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'COC_ALREADY_EXISTS',
          message: 'COC request already exists for this application',
        }),
      })
    );
    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('POST /api/coc-requests returns 400 when permit not yet collected (applicant)', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 11, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications')) {
          return {
            rows: [{
              id: 300,
              applicant_id: 11,
              status: 'approved',
              application_type: 'building',
              submitted_applicant_name: 'Test',
              submitted_email: 't@example.com',
            }],
          };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .post('/api/coc-requests')
      .send({ application_id: 300 });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'COC_NOT_ELIGIBLE',
        }),
      })
    );
    expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
  });

  test('POST /api/coc-requests returns 400 when permit not yet collected (admin)', async () => {
    const { app, mockClient } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM applications')) {
          return {
            rows: [{
              id: 400,
              applicant_id: 99,
              status: 'permit_approved',
              application_type: 'building',
              submitted_applicant_name: 'Admin Test',
              submitted_email: 'a@example.com',
            }],
          };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .post('/api/coc-requests')
      .send({ application_id: 400 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('COC_NOT_ELIGIBLE');
    expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
  });

  test('GET /api/coc-requests/:id returns 404 when request is missing', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 1, role: 'committee', accountType: 'staff' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM coc_requests c')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/api/coc-requests/999');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'COC_NOT_FOUND',
          message: 'COC request not found',
        }),
      })
    );
  });

  test('PATCH /api/coc-requests/:id/status rejects invalid status values', async () => {
    const { app, pool, mockClient } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app)
      .patch('/api/coc-requests/55/status')
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

  test('PATCH /api/coc-requests/:id/status blocks coc-collected before issued', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 1, role: 'admin', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, application_id, status FROM coc_requests WHERE id = $1')) {
          return { rows: [{ id: 55, application_id: 10, status: 'requested' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .patch('/api/coc-requests/55/status')
      .send({ status: 'coc-collected' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('COC_INVALID_STATUS');
  });

  test('POST /api/coc-requests/:id/payments blocks payment in invalid status', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 11, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('FROM coc_requests c') && sql.includes('FOR UPDATE')) {
          return {
            rows: [{ id: 21, application_id: 5, applicant_id: 11, status: 'issued', violation_report: null }],
          };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/coc-requests/21/payments')
      .send({ amount: 1500, payment_method: 'online' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('COC_INVALID_STATUS');
  });

  test('POST /api/coc-requests/:id/violations blocks invalid status branch', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 2, role: 'technical_officer', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM coc_requests WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 31, status: 'requested' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/coc-requests/31/violations')
      .send({ deviation_type: 'offset', fine_amount: 1000 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('COC_INVALID_STATUS');
  });

  test('POST /api/coc-requests/:id/reinspections blocks invalid status branch', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 2, role: 'technical_officer', accountType: 'staff' },
      poolQueryImpl: async () => ({ rows: [] }),
      poolConnectQueryImpl: async (sql) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('SELECT id, status FROM coc_requests WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ id: 41, status: 'requested' }] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/coc-requests/41/reinspections')
      .send({ result: 'pending' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('COC_INVALID_STATUS');
  });
});
