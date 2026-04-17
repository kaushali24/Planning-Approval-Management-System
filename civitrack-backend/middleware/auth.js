const jwt = require('jsonwebtoken');
const { sendError } = require('./errorHandler');

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return sendError(res, 401, 'No token provided', { code: 'AUTH_TOKEN_MISSING' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return sendError(res, 401, 'Invalid or expired token', { code: 'AUTH_TOKEN_INVALID' });
  }
};

module.exports = authMiddleware;
