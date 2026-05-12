const request = require('supertest');

describe('auth bearer parsing integration', () => {
  const loadAppWithPoolQuery = (poolQueryImpl) => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
    jest.doMock('../../config/db', () => ({
      query: jest.fn(poolQueryImpl || (async () => ({ rows: [] }))),
      connect: jest.fn(async () => ({
        query: jest.fn(poolQueryImpl || (async () => ({ rows: [] }))),
        release: jest.fn(),
      })),
    }));
    return require('../../server');
  };

  afterEach(() => {
    jest.dontMock('../../config/db');
    jest.resetModules();
  });

  test('rejects malformed authorization scheme with AUTH_TOKEN_MALFORMED', async () => {
    const app = loadAppWithPoolQuery();
    const response = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Token abc123');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTH_TOKEN_MALFORMED',
        }),
      })
    );
  });

  test('rejects missing token in Bearer header as malformed', async () => {
    const app = loadAppWithPoolQuery();
    const response = await request(app)
      .get('/api/applications')
      .set('Authorization', 'Bearer');

    expect(response.status).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: 'AUTH_TOKEN_MALFORMED',
        }),
      })
    );
  });
});
