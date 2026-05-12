/**
 * Bearer JWT gate for routes that require any authenticated user.
 *
 * Security / UX choices:
 * - Malformed `Authorization` (not `Bearer <token>`) is distinct from "missing" so clients can fix headers.
 * - Expired or bad signatures all map to the same 401 message so we do not distinguish attack vs typo
 *   (reduces information leakage to unauthenticated callers).
 */
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

const authMiddleware = (req, res, next) => {
  try {
    const { token, malformed } = extractBearerToken(req.headers.authorization);

    if (malformed) {
      return sendError(res, 401, 'Authorization header must be in Bearer token format', { code: 'AUTH_TOKEN_MALFORMED' });
    }

    if (!token) {
      return sendError(res, 401, 'No token provided', { code: 'AUTH_TOKEN_MISSING' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    // Intentionally one message for all verify failures (see file header).
    return sendError(res, 401, 'Invalid or expired token', { code: 'AUTH_TOKEN_INVALID' });
  }
};

module.exports = authMiddleware;
