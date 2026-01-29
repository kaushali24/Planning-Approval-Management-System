const jwt = require('jsonwebtoken');

// Generates a JWT with minimal user identity details
const generateToken = ({ userId, role, accountType, externalId }) => {
  return jwt.sign(
    { userId, role, accountType, externalId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

module.exports = { generateToken, verifyToken };
