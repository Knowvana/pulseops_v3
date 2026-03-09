// ============================================================================
// Auth Middleware — PulseOps V2 API
//
// PURPOSE: JWT-based authentication and role-based authorization.
// Implements the Dual-Auth Protocol defined in .windsurfrules:
//   1. Authorization: Bearer <token> (for Swagger/Postman/API tools)
//   2. HttpOnly cookie: accessToken (for frontend browser sessions)
//
// FEATURES:
//   - JWT access token generation and verification
//   - JWT refresh token generation and verification
//   - Password hashing with bcrypt (configurable rounds)
//   - Password comparison for login validation
//   - Role-based route protection (requireRole middleware)
//   - Token payload: { userId, email, name, role }
//
// SECURITY:
//   - Access tokens expire per config (default 24h)
//   - Refresh tokens use separate secret (default 7d)
//   - bcrypt rounds configurable (default 12)
//   - Expired vs invalid token differentiation in error responses
//
// DEPENDENCIES:
//   - jsonwebtoken (npm) — JWT sign/verify
//   - bcryptjs (npm) — password hashing
//   - ../../config/index.js → JWT secrets, expiry, bcrypt rounds
//   - ../../shared/loadJson.js → messages, errors from JSON
//   - ../../shared/logger.js → structured logging
// ============================================================================
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '#config';
import { logger } from '#shared/logger.js';
import { messages, errors } from '#shared/loadJson.js';

const JWT_SECRET = config.auth.jwtSecret;
const ACCESS_EXPIRY = config.auth.accessTokenExpiry;
const REFRESH_SECRET = config.auth.refreshSecret || config.auth.jwtSecret + '_refresh';
const REFRESH_EXPIRY = config.auth.refreshTokenExpiry;
const BCRYPT_ROUNDS = config.auth.bcryptRounds;

// ── Token Generation ─────────────────────────────────────────────────────────

/**
 * Generate an access token for a user.
 * @param {Object} user - { id, email, name, role, authMethod? }
 * @returns {string} JWT access token
 */
export function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role, authMethod: user.authMethod || 'database' },
    JWT_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
}

/**
 * Generate a refresh token for a user.
 * @param {Object} user - { id, email, authMethod? }
 * @returns {string} JWT refresh token
 */
export function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh', authMethod: user.authMethod || 'database' },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );
}

/**
 * Verify and decode an access token.
 * @param {string} token - JWT token string
 * @returns {Object} Decoded payload
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Verify and decode a refresh token.
 * @param {string} token - JWT refresh token string
 * @returns {Object} Decoded payload
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

// ── Password Hashing ─────────────────────────────────────────────────────────

/**
 * Hash a plaintext password with bcrypt.
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password with a bcrypt hash.
 * @param {string} password - Plaintext password
 * @param {string} hash - Bcrypt hash
 * @returns {Promise<boolean>} True if match
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ── Authentication Middleware ─────────────────────────────────────────────────

/**
 * Express middleware: Authenticate requests via Dual Auth Protocol.
 * Checks Bearer header first, then HttpOnly cookie fallback.
 * Attaches decoded user to req.user on success.
 * Returns 401 if token is missing, invalid, or expired.
 */
export function authenticate(req, res, next) {
  let token = null;

  // 1. Check Authorization Header (Bearer) — For Swagger/Postman
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  // 2. Fallback to HttpOnly Cookie — For Frontend
  else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: errors.errors.authTokenMissing },
    });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    logger.warn(errors.errors.authTokenInvalid, {
      error: err.message,
      requestId: req.requestId,
    });
    return res.status(401).json({
      success: false,
      error: {
        message: isExpired ? errors.errors.authTokenExpired : errors.errors.authTokenInvalid,
        code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      },
    });
  }
}

// ── Authorization Middleware ──────────────────────────────────────────────────

/**
 * Express middleware factory: Require the authenticated user to have
 * one of the specified roles.
 * @param {...string} roles - Allowed roles (e.g. 'super_admin', 'admin')
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: errors.errors.authTokenMissing },
      });
    }

    if (!roles.includes(req.user.role)) {
      logger.warn(errors.errors.authForbidden, {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: roles,
        path: req.originalUrl,
        requestId: req.requestId,
      });
      return res.status(403).json({
        success: false,
        error: { message: errors.errors.authForbidden },
      });
    }

    next();
  };
}
