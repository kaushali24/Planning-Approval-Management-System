const { sendError, notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('errorHandler middleware', () => {
  test('sendError returns standardized shape', () => {
    const res = createMockRes();
    sendError(res, 400, 'Validation failed', {
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'email', message: 'Invalid email' }],
      path: '/api/auth/register',
      method: 'POST',
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'Invalid email' }],
        path: '/api/auth/register',
        method: 'POST',
      },
    });
  });

  test('notFoundHandler maps to ROUTE_NOT_FOUND', () => {
    const req = { originalUrl: '/missing', method: 'GET' };
    const res = createMockRes();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'ROUTE_NOT_FOUND' }),
      })
    );
  });

  test('globalErrorHandler uses provided status and code', () => {
    const err = { status: 403, code: 'AUTH_FORBIDDEN', message: 'Forbidden' };
    const req = { originalUrl: '/api/applications', method: 'GET' };
    const res = createMockRes();
    const next = jest.fn();

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'AUTH_FORBIDDEN', message: 'Forbidden' }),
      })
    );
  });
});
