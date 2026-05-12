const jwt = require('jsonwebtoken');
const { sendError } = require('./errorHandler');

const extractBearerToken = (authorizationHeader) => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return { token: null, malformed: false };
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/);
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return { token: null, malformed: true };
  }

  return { token, malformed: false };
};

const adminAuthMiddleware = (req, res, next) => {
  try {
    const { token, malformed } = extractBearerToken(req.headers.authorization);

    if (malformed) {
      return sendError(res, 401, 'Authorization header must be in Bearer token format', { code: 'AUTH_TOKEN_MALFORMED' });
    }

    if (!token) {
      return sendError(res, 401, 'No token provided', { code: 'AUTH_TOKEN_MISSING' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user is admin
    if (decoded.role !== 'admin') {
      return sendError(res, 403, 'Admin access required', { code: 'AUTH_FORBIDDEN' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return sendError(res, 401, 'Invalid or expired token', { code: 'AUTH_TOKEN_INVALID' });
  }
};

module.exports = adminAuthMiddleware;
