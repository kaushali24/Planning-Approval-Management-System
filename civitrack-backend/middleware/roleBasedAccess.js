/**
 * Role-scoped auth: same Bearer contract as `middleware/auth.js`, but adds **403** when the token is
 * valid yet the role is not in `allowedRoles`.
 *
 * `isApplicationOwner` enforces applicant row ownership by `applications.applicant_id`; staff/admin
 * paths skip that check by design (see inline branch).
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

/**
 * Verify JWT and extract user info
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Middleware: require one of `allowedRoles` on a valid JWT.
 * 401 = missing/invalid token; 403 = valid token but role not allowed.
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      const { token, malformed } = extractBearerToken(req.headers.authorization);

      if (malformed) {
        return sendError(res, 401, 'Authorization header must be in Bearer token format', { code: 'AUTH_TOKEN_MALFORMED' });
      }

      if (!token) {
        return sendError(res, 401, 'No token provided', { code: 'AUTH_TOKEN_MISSING' });
      }

      const decoded = verifyToken(token);
      
      if (!decoded) {
        return sendError(res, 401, 'Invalid or expired token', { code: 'AUTH_TOKEN_INVALID' });
      }

      if (!decoded.role || !allowedRoles.includes(decoded.role)) {
        return sendError(res, 403, 'Insufficient permissions', { code: 'AUTH_FORBIDDEN' });
      }

      req.user = decoded;
      next();
    } catch (error) {
      return sendError(res, 401, 'Authentication failed', { code: 'AUTH_FAILED' });
    }
  };
};

/**
 * Middleware: Check if user can access a specific application
 * Applicants can only access their own applications
 * Staff can access applications assigned to them or their department
 * Admin can access all
 */
const canAccessApplication = (req, res, next) => {
  // Placeholder for a richer policy (assignment/department). Callers today rely on `isApplicationOwner`
  // or controller-level checks; keep this a no-op so route stacks do not break.
  next();
};

/**
 * Middleware: Check if user is the owner of the application or has admin/staff role
 */
const isApplicationOwner = (pool) => {
  return async (req, res, next) => {
    try {
      const { id: applicationId } = req.params;
      const user = req.user;

      if (!user) {
        return sendError(res, 401, 'Not authenticated', { code: 'AUTH_REQUIRED' });
      }

      // Admin and staff bypass this check (checked separately)
      if (user.role === 'admin' || user.role === 'committee' || user.accountType === 'staff') {
        return next();
      }

      // Applicants can only access their own applications
      if (user.accountType === 'applicant' || user.role === 'applicant') {
        const result = await pool.query(
          'SELECT applicant_id FROM applications WHERE id = $1',
          [applicationId]
        );

        if (!result.rows.length) {
          return sendError(res, 404, 'Application not found', { code: 'APPLICATION_NOT_FOUND' });
        }

        // Authenticated applicant, but not the owner of this application row.
        if (result.rows[0].applicant_id !== user.userId) {
          return sendError(res, 403, 'You do not have access to this application', { code: 'AUTH_FORBIDDEN' });
        }

        return next();
      }

      return sendError(res, 403, 'Invalid user role', { code: 'AUTH_FORBIDDEN' });
    } catch (error) {
      console.error('Authorization error:', error);
      return sendError(res, 500, 'Authorization check failed', { code: 'AUTH_CHECK_FAILED', details: error.message });
    }
  };
};

module.exports = {
  requireRole,
  isApplicationOwner,
  verifyToken,
  canAccessApplication,
};
