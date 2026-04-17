const { validationResult } = require('express-validator');

const DEFAULT_ERROR_CODE = 'INTERNAL_SERVER_ERROR';

const sendError = (res, status, message, options = {}) => {
  const {
    code,
    details,
    errors,
    path,
    method,
  } = options;

  const payload = {
    success: false,
    error: {
      code: code || DEFAULT_ERROR_CODE,
      message,
    },
  };

  if (details !== undefined) {
    payload.error.details = details;
  }

  if (Array.isArray(errors) && errors.length > 0) {
    payload.error.errors = errors;
  }

  if (path) {
    payload.error.path = path;
  }

  if (method) {
    payload.error.method = method;
  }

  return res.status(status).json(payload);
};

const formatValidationErrors = (req) => {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return null;
  }

  return result.array().map((err) => ({
    field: err.path || err.param,
    message: err.msg,
    value: err.value,
    location: err.location,
  }));
};

const validateRequest = (req, res, next) => {
  const errors = formatValidationErrors(req);
  if (errors) {
    return sendError(res, 400, 'Validation failed', {
      code: 'VALIDATION_ERROR',
      errors,
      path: req.originalUrl,
      method: req.method,
    });
  }
  return next();
};

const notFoundHandler = (req, res) => sendError(res, 404, 'Route not found', {
  code: 'ROUTE_NOT_FOUND',
  path: req.originalUrl,
  method: req.method,
});

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const code = err.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const message = err.message || 'An unexpected error occurred';

  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled API error:', {
      status,
      code,
      message,
      stack: err.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  return sendError(res, status, message, {
    code,
    details: status >= 500 && process.env.NODE_ENV === 'production' ? undefined : err.details,
    path: req.originalUrl,
    method: req.method,
  });
};

module.exports = {
  sendError,
  validateRequest,
  globalErrorHandler,
  notFoundHandler,
};
