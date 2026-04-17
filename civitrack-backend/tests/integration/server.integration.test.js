const request = require('supertest');

describe('server integration', () => {
  jest.setTimeout(15000);

  const loadAppWithPoolQuery = (poolQueryImpl) => {
    jest.resetModules();
    jest.doMock('../../config/db', () => ({
      query: jest.fn(poolQueryImpl),
    }));
    return require('../../server');
  };

  afterEach(() => {
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('GET /api/health returns success', async () => {
    const app = loadAppWithPoolQuery(async () => ({ rows: [{ now: new Date().toISOString() }] }));
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'Backend is running' });
  });

  test('GET /missing-route returns standardized 404 response', async () => {
    const app = loadAppWithPoolQuery(async () => ({ rows: [] }));
    const response = await request(app).get('/api/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'ROUTE_NOT_FOUND',
          message: 'Route not found',
          path: '/api/this-route-does-not-exist',
          method: 'GET',
        }),
      })
    );
  });

  test('GET /api/db-test returns standardized 500 on db failure', async () => {
    const app = loadAppWithPoolQuery(async () => {
      throw new Error('DB unavailable');
    });

    const response = await request(app).get('/api/db-test');

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'DB unavailable',
          path: '/api/db-test',
          method: 'GET',
        }),
      })
    );
  });
});
