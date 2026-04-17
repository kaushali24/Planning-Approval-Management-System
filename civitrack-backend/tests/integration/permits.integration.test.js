const request = require('supertest');

describe('permits integration', () => {
  let consoleErrorSpy;

  const loadAppWithMocks = ({ clientQueryImpl, poolQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = { userId: 99, role: 'admin', accountType: 'staff' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const pool = {
      query: jest.fn(poolQueryImpl || (async () => ({ rows: [] }))),
      connect: jest.fn(async () => ({
        query: jest.fn(clientQueryImpl || (async () => ({ rows: [] }))),
        release: jest.fn(),
      })),
    };

    jest.doMock('../../config/db', () => pool);

    const app = require('../../server');
    return { app, pool };
  };

  afterEach(() => {
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
      consoleErrorSpy = null;
    }
    jest.dontMock('../../middleware/auth');
    jest.dontMock('../../middleware/roleBasedAccess');
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('POST /api/permits/:applicationId/issue validates route params', async () => {
    const { app } = loadAppWithMocks({});

    const response = await request(app)
      .post('/api/permits/not-a-number/issue')
      .send({ valid_until: '2026-12-01T00:00:00.000Z' });

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

  test('POST /api/permits/:applicationId/issue returns 404 when application does not exist', async () => {
    const { app } = loadAppWithMocks({
      clientQueryImpl: async (sql) => {
        if (sql.includes('SELECT id, applicant_id, application_type, status')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/permits/1/issue')
      .send({ valid_until: '2026-12-01T00:00:00.000Z' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        }),
      })
    );
  });

  test('POST /api/permits/:applicationId/extend enforces extension limit', async () => {
    const { app } = loadAppWithMocks({
      clientQueryImpl: async (sql) => {
        if (sql.includes('FROM permit_workflow')) {
          return {
            rows: [
              {
                id: 500,
                application_id: 1,
                valid_until: '2026-12-01T00:00:00.000Z',
                max_years: 5,
                extensions_used: 4,
              },
            ],
          };
        }

        return { rows: [] };
      },
    });

    const response = await request(app)
      .post('/api/permits/1/extend')
      .send({ payment_status: 'completed' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'PERMIT_EXTENSION_LIMIT_REACHED',
          message: 'Maximum permit extension limit reached',
        }),
      })
    );
  });

  test('GET /api/permits/reports/expiring returns 500 on db error', async () => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { app } = loadAppWithMocks({
      poolQueryImpl: async () => {
        throw new Error('permit report query failed');
      },
    });

    const response = await request(app).get('/api/permits/reports/expiring?days=30');

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'PERMIT_EXPIRING_FETCH_FAILED',
          message: 'Failed to fetch expiring permits',
          details: 'permit report query failed',
        }),
      })
    );
  });
});
