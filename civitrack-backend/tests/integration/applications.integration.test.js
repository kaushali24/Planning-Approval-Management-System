const request = require('supertest');

describe('applications integration', () => {
  let consoleErrorSpy;

  const loadAppWithMocks = ({ poolQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = { userId: 1, role: 'admin', accountType: 'staff' };
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

  test('GET /api/applications validates invalid fromDate', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/api/applications?fromDate=2026/01/01');

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

  test('GET /api/applications returns paginated data', async () => {
    const { app } = loadAppWithMocks({
      poolQueryImpl: async (sql) => {
        if (sql.includes('COUNT(*) as total')) {
          return { rows: [{ total: '1' }] };
        }

        return {
          rows: [
            {
              id: 101,
              applicant_id: 1,
              application_type: 'building',
              status: 'submitted',
              submitted_applicant_name: 'Kaushali',
              submitted_email: 'kaushalinanayakkara2001@gmail.com',
              submitted_address: 'Kelaniya',
              document_count: '2',
              inspection_count: '0',
            },
          ],
        };
      },
    });

    const response = await request(app).get('/api/applications?page=1&limit=20');

    expect(response.status).toBe(200);
    expect(response.body.applications).toHaveLength(1);
    expect(response.body.pagination).toEqual(
      expect.objectContaining({
        total: 1,
        page: 1,
        limit: 20,
        pages: 1,
      })
    );
  });

  test('GET /api/applications returns 500 when db query fails', async () => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { app } = loadAppWithMocks({
      poolQueryImpl: async () => {
        throw new Error('database unavailable');
      },
    });

    const response = await request(app).get('/api/applications');

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: 'Failed to fetch applications',
        details: 'database unavailable',
      })
    );
  });
});
