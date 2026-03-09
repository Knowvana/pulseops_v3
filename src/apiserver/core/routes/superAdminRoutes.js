// ============================================================================
// Super Admin Routes — PulseOps V2 API
//
// PURPOSE: Authentication and credential management for the single SuperAdmin
// account, which is always authenticated against DefaultSuperAdmin.json
// (never the database). SuperAdmin has SUPER_ADMIN role and unrestricted
// access to the entire platform.
//
// ENDPOINTS (Public):
//   POST /auth/superadmin/login    — Authenticate SuperAdmin via JSON credentials
//
// ENDPOINTS (Protected — super_admin role only):
//   GET  /auth/superadmin/profile  — Get SuperAdmin profile + metadata
//   PATCH /auth/superadmin/password — Update SuperAdmin password (bcrypt stored)
//
// SECURITY:
//   - Password stored as bcrypt hash (BCRYPT_ROUNDS from config)
//   - On first login with empty hash: compares against defaultPassword, then
//     immediately hashes and persists it, clearing defaultPassword
//   - New passwords validated: min 12 chars, upper/lower/digit/special required
//   - Separate auth rate limiter applied at mount in app.js
//   - HttpOnly cookies set on successful login
//
// K8S / POD SAFETY:
//   - DefaultSuperAdmin.json is a mounted config volume in K8s
//   - All reads use fresh file I/O (no in-memory cache) to support pod restarts
//
// DEPENDENCIES:
//   - ../middleware/auth.js → generateAccessToken, generateRefreshToken,
//                             comparePassword, hashPassword, authenticate,
//                             requireRole
//   - ../../config/index.js → auth config
//   - ../../shared/loadJson.js → loadJson, saveJson, messages, errors
//   - ../../shared/logger.js → structured logging
// ============================================================================
import { Router } from 'express';
import {
  generateAccessToken,
  generateRefreshToken,
  comparePassword,
  hashPassword,
  authenticate,
  requireRole,
} from '#core/middleware/auth.js';
import { config } from '#config';
import { messages, errors, loadJson, saveJson } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

const router = Router();

const SUPER_ADMIN_FILE = 'DefaultSuperAdmin.json';

// ── Password strength validator ───────────────────────────────────────────────
// Min 12 chars | uppercase | lowercase | digit | special char
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{12,}$/;

// ── Helper: load SuperAdmin config (always fresh read for K8s pod safety) ────
function loadSuperAdmin() {
  const cfg = loadJson(SUPER_ADMIN_FILE);
  return cfg.superAdmin;
}

// ── Helper: persist SuperAdmin config changes ─────────────────────────────────
function saveSuperAdmin(updated) {
  saveJson(SUPER_ADMIN_FILE, { superAdmin: updated });
}

// ── GET /auth/superadmin/info (Public) ──────────────────────────────────────
// Returns SA username + email so the frontend can detect SA by either identifier.
router.get('/info', (req, res) => {
  const sa = loadSuperAdmin();
  if (!sa) return res.status(500).json({ success: false, error: { message: 'SuperAdmin config not found' } });
  return res.json({ success: true, data: { username: sa.username, email: sa.email } });
});

// ── POST /auth/superadmin/login (Public) ─────────────────────────────────────
router.post('/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] SuperAdmin login attempt`);

  if (!password) {
    logger.warn(`[${requestId}] SuperAdmin login failed — password not provided`);
    return res.status(400).json({
      success: false,
      error: {
        message: errors.errors.authCredentialsRequired,
        code: 'CREDENTIALS_REQUIRED',
        requestId,
      },
    });
  }

  try {
    const sa = loadSuperAdmin();

    if (!sa) {
      logger.error(`[${requestId}] SuperAdmin config not found in ${SUPER_ADMIN_FILE}`);
      return res.status(500).json({
        success: false,
        error: { message: errors.errors.superAdminNotFound, code: 'CONFIG_NOT_FOUND', requestId },
      });
    }

    // ── Optional identifier check: if provided, must match SA username or email ──
    if (usernameOrEmail) {
      const lower = usernameOrEmail.trim().toLowerCase();
      if (lower !== sa.username?.toLowerCase() && lower !== sa.email?.toLowerCase()) {
        logger.warn(`[${requestId}] SuperAdmin login failed — identifier does not match`);
        return res.status(401).json({
          success: false,
          error: { message: errors.errors.superAdminInvalidCredentials, code: 'INVALID_CREDENTIALS', requestId },
        });
      }
    }

    if (sa.status !== 'active') {
      logger.warn(`[${requestId}] SuperAdmin login denied — account inactive`);
      return res.status(403).json({
        success: false,
        error: { message: errors.errors.superAdminAccountInactive, code: 'ACCOUNT_INACTIVE', requestId },
      });
    }

    let authenticated = false;

    if (!sa.passwordHash) {
      // ── No hash set yet: compare against plaintext defaultPassword ───────────
      // Password is ONLY hashed when explicitly changed via Settings → SuperAdmin Auth.
      // Login never modifies the credential file.
      logger.info(`[${requestId}] SuperAdmin login — comparing against defaultPassword`);
      authenticated = !!(sa.defaultPassword && password === sa.defaultPassword);
    } else {
      // ── Hash exists: bcrypt compare ───────────────────────────────────────────
      authenticated = await comparePassword(password, sa.passwordHash);
    }

    if (!authenticated) {
      logger.warn(`[${requestId}] SuperAdmin login failed — invalid password`);
      return res.status(401).json({
        success: false,
        error: { message: errors.errors.superAdminInvalidCredentials, code: 'INVALID_CREDENTIALS', requestId },
      });
    }

    // ── Update lastLoginAt ───────────────────────────────────────────────────
    const freshSa = loadSuperAdmin();
    saveSuperAdmin({ ...freshSa, lastLoginAt: new Date().toISOString() });

    const userPayload = {
      id: sa.id,
      email: sa.email,
      name: sa.name,
      role: sa.role,
      authMethod: 'json_file',
    };

    const accessToken  = generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken(userPayload);

    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.auth.jwtExpiresInSeconds * 1000,
    };

    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info(messages.success.superAdminLoginSuccess, {
      userId: sa.id, email: sa.email, requestId,
    });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: config.auth.jwtExpiresInSeconds,
        user: userPayload,
        requirePasswordChange: freshSa.requirePasswordChange || false,
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] SuperAdmin login error — ${err.message}`, {
      error: err.message, stack: err.stack, requestId,
    });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.superAdminLoginFailed, code: 'SERVER_ERROR', requestId },
    });
  }
});

// ── GET /auth/superadmin/profile (Protected — super_admin only) ──────────────
router.get('/profile', authenticate, requireRole('super_admin'), (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] SuperAdmin profile requested`, { userId: req.user?.userId });

  try {
    const sa = loadSuperAdmin();
    if (!sa) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.superAdminNotFound, requestId },
      });
    }

    logger.info(messages.success.superAdminProfileLoaded, { requestId });
    return res.json({
      success: true,
      data: {
        id: sa.id,
        username: sa.username,
        email: sa.email,
        name: sa.name,
        role: sa.role,
        status: sa.status,
        passwordLastChangedAt: sa.passwordLastChangedAt,
        lastLoginAt: sa.lastLoginAt,
        requirePasswordChange: sa.requirePasswordChange || false,
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] Failed to load SuperAdmin profile — ${err.message}`, { requestId });
    return res.status(500).json({
      success: false,
      error: { message: err.message, requestId },
    });
  }
});

// ── PATCH /auth/superadmin/password (Protected — super_admin only) ────────────
router.patch('/password', authenticate, requireRole('super_admin'), async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] SuperAdmin password change requested`, { userId: req.user?.userId });

  if (!currentPassword || !newPassword) {
    logger.warn(`[${requestId}] SuperAdmin password change rejected — missing fields`);
    return res.status(400).json({
      success: false,
      error: {
        message: errors.errors.superAdminPasswordRequired,
        code: 'FIELDS_REQUIRED',
        requestId,
      },
    });
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    logger.warn(`[${requestId}] SuperAdmin password change rejected — new password too weak`);
    return res.status(400).json({
      success: false,
      error: {
        message: errors.errors.superAdminPasswordWeak,
        code: 'PASSWORD_WEAK',
        detail: 'Minimum 12 characters with uppercase, lowercase, digit, and special character.',
        requestId,
      },
    });
  }

  try {
    const sa = loadSuperAdmin();
    if (!sa) {
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.superAdminNotFound, requestId },
      });
    }

    // Verify current password (bcrypt compare or defaultPassword for bootstrap)
    let currentValid = false;
    if (!sa.passwordHash) {
      currentValid = currentPassword === sa.defaultPassword;
    } else {
      currentValid = await comparePassword(currentPassword, sa.passwordHash);
    }

    if (!currentValid) {
      logger.warn(`[${requestId}] SuperAdmin password change rejected — current password incorrect`);
      return res.status(401).json({
        success: false,
        error: { message: errors.errors.superAdminPasswordMismatch, code: 'CURRENT_PASSWORD_WRONG', requestId },
      });
    }

    const newHash = await hashPassword(newPassword);
    const now = new Date().toISOString();

    saveSuperAdmin({
      ...sa,
      passwordHash: newHash,
      defaultPassword: '',
      requirePasswordChange: false,
      passwordLastChangedAt: now,
    });

    logger.info(messages.success.superAdminPasswordChanged, {
      userId: sa.id, email: sa.email, requestId,
    });

    return res.json({
      success: true,
      data: {
        message: messages.success.superAdminPasswordChanged,
        passwordLastChangedAt: now,
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] SuperAdmin password update failed — ${err.message}`, {
      error: err.message, requestId,
    });
    return res.status(500).json({
      success: false,
      error: { message: errors.errors.superAdminUpdateFailed, code: 'SERVER_ERROR', requestId },
    });
  }
});

export default router;
