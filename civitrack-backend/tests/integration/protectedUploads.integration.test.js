const request = require('supertest');

describe('protected uploads integration', () => {
  const loadAppWithMocks = ({ user, poolQueryImpl }) => {
    jest.resetModules();

    jest.doMock('../../middleware/auth', () => (req, res, next) => {
      req.user = user || { userId: 1, role: 'applicant', accountType: 'applicant' };
      next();
    });

    jest.doMock('../../middleware/roleBasedAccess', () => ({
      requireRole: () => (req, res, next) => next(),
      isApplicationOwner: () => (req, res, next) => next(),
    }));

    const pool = {
      query: jest.fn(poolQueryImpl || (async () => ({ rows: [] }))),
      connect: jest.fn(async () => ({ query: jest.fn(async () => ({ rows: [] })), release: jest.fn() })),
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

  test('rejects invalid path characters on /uploads route', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 10, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async () => ({ rows: [] }),
    });

    const response = await request(app).get('/uploads/folder%5Csecrets.txt');
    expect(response.status).toBe(400);
    expect(response.body).toEqual(expect.objectContaining({ error: 'Invalid file path' }));
  });

  test('denies applicant access to other applicant file on /uploads route', async () => {
    const { app } = loadAppWithMocks({
      user: { userId: 10, role: 'applicant', accountType: 'applicant' },
      poolQueryImpl: async (sql) => {
        if (sql.includes('FROM documents d') && sql.includes('JOIN applications a')) {
          return {
            rows: [{
              id: 5,
              application_id: 101,
              applicant_id: 99,
              storage_key: 'APP/2026/00001/doc.pdf',
              stored_filename: 'doc.pdf',
            }],
          };
        }
        return { rows: [] };
      },
    });

    const response = await request(app).get('/uploads/APP/2026/00001/doc.pdf');
    expect(response.status).toBe(403);
    expect(response.body).toEqual(expect.objectContaining({ error: 'Access denied' }));
  });
});

