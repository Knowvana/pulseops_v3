// ============================================================================
// Auth Routes — PulseOps V2 API
//
// PURPOSE: Authentication endpoints for regular platform users.
// All regular users authenticate against PostgreSQL (system_users table).
// SuperAdmin has a separate route: /auth/superadmin/*
// Social/OAuth/SAML will be supported in a future release.
//
// ENDPOINTS (Public):
//   POST /auth/login      — Authenticate with email/password → JWT tokens
//   GET  /auth/provider   — Get current auth provider configuration
//
// ENDPOINTS (Protected — JWT required):
//   POST /auth/refresh    — Refresh an expired access token
//   POST /auth/logout     — Logout (clear cookies + client discards token)
//   GET  /auth/me         — Get current authenticated user profile
//   PUT  /auth/provider   — Update auth provider (super_admin only)
//
// PROVIDER ROUTING:
//   database → validates against pulseops.system_users in PostgreSQL (default)
//   social   → OAuth/SAML (coming soon)
//
// SECURITY:
//   - Passwords hashed/compared with bcrypt (BCRYPT_ROUNDS from config)
//   - HttpOnly cookies set on login for frontend security
//   - Bearer tokens also returned for Swagger/API tool usage
//   - Auth rate limiter applied at mount point in app.js
//   - json_file provider is REMOVED — only SuperAdmin uses JSON file auth
//
// DEPENDENCIES:
//   - ../middleware/auth.js → JWT, bcrypt, authenticate, requireRole
//   - ../database/databaseService.js → DB user lookup
//   - ../../config/index.js → schema, auth config
//   - ../../shared/loadJson.js → messages, errors, loadJson, saveJson
//   - ../../shared/logger.js → structured logging
// ============================================================================
import { Router } from 'express';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  comparePassword,
  hashPassword,
  authenticate,
  requireRole,
} from '#core/middleware/auth.js';
import DatabaseService from '#core/database/databaseService.js';
import { config } from '#config';
import { messages, errors, loadJson, saveJson } from '#shared/loadJson.js';
import { logger } from '#shared/logger.js';

const router = Router();
const schema = config.db.schema || 'pulseops';
const AUTH_PROVIDER_FILE = 'auth-provider.json';

// ── Auth Provider Helpers ────────────────────────────────────────────────────

/**
 * Read active auth provider from DB first, fall back to auth-provider.json.
 * Supported: 'database' | 'social'  (json_file is REMOVED)
 * @returns {Promise<string>}
 */
async function getAuthProvider() {
  try {
    const result = await DatabaseService.query(
      `SELECT value FROM ${schema}.system_config WHERE key = 'auth_provider' LIMIT 1`
    );
    const p = result.rows[0]?.value?.provider;
    if (p && p !== 'json_file') return p;
  } catch {
    // DB not available — fall back to file
  }
  try {
    const fileConfig = loadJson(AUTH_PROVIDER_FILE);
    const p = fileConfig.provider;
    return (p && p !== 'json_file') ? p : 'database';
  } catch {
    return 'database';
  }
}

/**
 * Persist provider to auth-provider.json AND system_config table (if DB ready).
 * @param {string} provider 'database' | 'social'
 */
async function saveAuthProvider(provider) {
  const existing = loadJson(AUTH_PROVIDER_FILE);
  existing.provider = provider;
  saveJson(AUTH_PROVIDER_FILE, existing);

  try {
    await DatabaseService.query(
      `INSERT INTO ${schema}.system_config (key, value, description, updated_at)
       VALUES ('auth_provider', $1, 'Active authentication provider', NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify({ provider })]
    );
  } catch {
    // DB not available — file save is sufficient
  }
}

/**
 * Authenticate regular user against PostgreSQL system_users.
 * All users (admin, operator, user, viewer) use this path.
 * SuperAdmin has a SEPARATE route at /auth/superadmin/login.
 */
async function loginWithDatabase(email, password) {
  const result = await DatabaseService.query(
    `SELECT id, email, name, role, password_hash, status FROM ${schema}.system_users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (!user) return { error: 'INVALID_CREDENTIALS' };
  if (user.status !== 'active') return { error: 'ACCOUNT_INACTIVE' };

  // If password_hash is null, use default password and set hash on first login
  if (!user.password_hash) {
    const defaultPassword = config.auth.defaultPassword;
    if (password !== defaultPassword) return { error: 'INVALID_CREDENTIALS' };
    const hash = await hashPassword(defaultPassword);
    await DatabaseService.query(
      `UPDATE ${schema}.system_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [hash, user.id]
    );
  } else {
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) return { error: 'INVALID_CREDENTIALS' };
  }

  await DatabaseService.query(
    `UPDATE ${schema}.system_users SET last_login = NOW() WHERE id = $1`,
    [user.id]
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      authMethod: 'database',
    },
  };
}

// ── GET /auth/provider (Public) ────────────────────────────────────────────
router.get('/provider', async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] GET /auth/provider — loading auth provider config`);
  try {
    const fileConfig = loadJson(AUTH_PROVIDER_FILE);
    const activeProvider = await getAuthProvider();

    logger.info(messages.success.authProviderLoaded, { provider: activeProvider, requestId });

    res.json({
      success: true,
      data: {
        provider: activeProvider,
        availableProviders: ['database', 'social'],
        social: fileConfig.social || { enabled: false },
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] Failed to load auth provider — ${err.message}`, { requestId });
    res.status(500).json({
      success: false,
      error: { message: errors.errors.authProviderSaveFailed, requestId },
    });
  }
});

// ── PUT /auth/provider (Protected — super_admin only) ──────────────────────
// Supported providers: 'database' | 'social'  (json_file is prohibited)
router.put('/provider', authenticate, requireRole('super_admin'), async (req, res) => {
  const requestId = req.requestId;
  const { provider } = req.body;
  logger.info(`[${requestId}] PUT /auth/provider — switch request`, { provider, user: req.user?.email });

  const validProviders = ['database', 'social'];
  if (!provider || !validProviders.includes(provider)) {
    logger.warn(`[${requestId}] Auth provider switch rejected — invalid provider: ${provider}`);
    return res.status(400).json({
      success: false,
      error: { message: errors.errors.authProviderInvalid, code: 'INVALID_PROVIDER', requestId },
    });
  }

  // Verify DB readiness when switching to database provider
  if (provider === 'database') {
    try {
      const status = await DatabaseService.getSchemaStatus();
      if (!status.initialized || !status.hasDefaultData) {
        logger.warn(`[${requestId}] Auth provider switch to database rejected — schema not ready`);
        return res.status(400).json({
          success: false,
          error: { message: errors.errors.authProviderDbNotReady, code: 'DB_NOT_READY', requestId },
        });
      }
    } catch {
      return res.status(400).json({
        success: false,
        error: { message: errors.errors.authProviderDbNotReady, code: 'DB_NOT_READY', requestId },
      });
    }
  }

  try {
    await saveAuthProvider(provider);
    logger.info(messages.success.authProviderSaved, { provider, userId: req.user.userId, requestId });
    res.json({
      success: true,
      data: { provider, message: messages.success.authProviderSaved },
    });
  } catch (err) {
    logger.error(errors.errors.authProviderSaveFailed, { error: err.message, requestId });
    res.status(500).json({
      success: false,
      error: { message: errors.errors.authProviderSaveFailed, code: 'SAVE_FAILED', requestId },
    });
  }
});

// ── POST /auth/login (Public) — database users only ─────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const requestId = req.requestId;

  logger.info(`[${requestId}] POST /auth/login — login attempt`, { email, requestId });

  if (!email || !password) {
    logger.warn(`[${requestId}] Login rejected — missing email or password`);
    return res.status(400).json({
      success: false,
      error: { message: errors.errors.authCredentialsRequired, code: 'CREDENTIALS_REQUIRED', requestId },
    });
  }

  try {
    // All regular users authenticate against the database
    logger.info(`[${requestId}] Authenticating user against database`, { email });
    const result = await loginWithDatabase(email, password);

    if (result.error === 'INVALID_CREDENTIALS') {
      logger.warn(`[${requestId}] Login failed — invalid credentials`, { email, requestId });
      return res.status(401).json({
        success: false,
        error: { message: errors.errors.authInvalidCredentials, code: 'INVALID_CREDENTIALS', requestId },
      });
    }

    if (result.error === 'ACCOUNT_INACTIVE') {
      logger.warn(`[${requestId}] Login failed — account inactive`, { email, requestId });
      return res.status(403).json({
        success: false,
        error: { message: errors.errors.authAccountInactive, code: 'ACCOUNT_INACTIVE', requestId },
      });
    }

    logger.info(`[${requestId}] Authentication successful`, { email, userId: result.user.id, role: result.user.role });

    const accessToken  = generateAccessToken(result.user);
    const refreshToken = generateRefreshToken(result.user);

    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.auth.jwtExpiresInSeconds * 1000,
    };
    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });

    logger.info(messages.success.authLoginSuccess, { userId: result.user.id, email, requestId });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        expiresIn: config.auth.jwtExpiresInSeconds,
        user: result.user,
      },
    });
  } catch (err) {
    logger.error(`[${requestId}] Login error — ${err.message}`, { error: err.message, requestId });
    // Detect pg/network DB unavailability and return 503
    const isDbDown = err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND'
      || err.code === '3D000' || err.code === '28P01'
      || /connect|ECONNREFUSED|database|relation.*does not exist/i.test(err.message || '');
    if (isDbDown) {
      return res.status(503).json({
        success: false,
        error: { message: errors.errors.authDbUnavailable, code: 'DB_UNAVAILABLE', requestId },
      });
    }
    res.status(500).json({
      success: false,
      error: { message: errors.errors.authLoginFailed, code: 'SERVER_ERROR', requestId },
    });
  }
});

// ── POST /auth/refresh ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const requestId = req.requestId;
  // Accept token from body or cookie
  const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
  logger.info(`[${requestId}] POST /auth/refresh — token refresh request`);

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: { message: errors.errors.authRefreshTokenRequired, requestId },
    });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    let user;

    // SuperAdmin tokens (authMethod=json_file) — validate against JSON config
    if (decoded.authMethod === 'json_file') {
      const { loadJson: lj } = await import('#shared/loadJson.js');
      const sa = lj('DefaultSuperAdmin.json')?.superAdmin;
      if (sa?.id === decoded.userId && sa?.status === 'active') {
        user = { id: sa.id, email: sa.email, name: sa.name, role: sa.role };
      }
    } else {
      // Regular users — validate against database
      const result = await DatabaseService.query(
        `SELECT id, email, name, role, status FROM ${schema}.system_users WHERE id = $1`,
        [decoded.userId]
      );
      const dbUser = result.rows[0];
      if (dbUser?.status === 'active') user = dbUser;
    }

    if (!user) {
      logger.warn(`[${requestId}] Token refresh failed — user not found or inactive`);
      return res.status(401).json({
        success: false,
        error: { message: errors.errors.authRefreshInvalid, requestId },
      });
    }

    const newAccessToken = generateAccessToken(user);
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: config.auth.jwtExpiresInSeconds * 1000,
    });

    logger.info(messages.success.authTokenRefreshed, { userId: user.id, requestId });
    res.json({
      success: true,
      data: { accessToken: newAccessToken, expiresIn: config.auth.jwtExpiresInSeconds },
    });
  } catch (err) {
    logger.warn(`[${requestId}] Token refresh failed — ${err.message}`, { error: err.message, requestId });
    res.status(401).json({
      success: false,
      error: { message: errors.errors.authRefreshInvalid, requestId },
    });
  }
});

// ── POST /auth/logout (Protected) ──────────────────────────────────────────
router.post('/logout', authenticate, (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] POST /auth/logout — user logout`, { userId: req.user?.userId, email: req.user?.email });
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  logger.info(messages.success.authLogoutSuccess, { userId: req.user.userId, requestId });
  res.json({
    success: true,
    data: { message: messages.success.authLogoutSuccess },
  });
});

// ── GET /auth/me (Protected) ───────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  const requestId = req.requestId;
  logger.info(`[${requestId}] GET /auth/me — profile request`, { userId: req.user?.userId });

  try {
    // SuperAdmin is identified by authMethod in token (new JWTs) or by role (stale JWTs pre-fix)
    if (req.user?.authMethod === 'json_file' || req.user?.role === 'super_admin') {
      const sa = loadJson('DefaultSuperAdmin.json')?.superAdmin;
      if (!sa) {
        return res.status(404).json({ success: false, error: { message: errors.errors.authUserNotFound } });
      }
      return res.json({
        success: true,
        data: {
          id: sa.id, email: sa.email, name: sa.name, role: sa.role,
          authMethod: 'json_file', status: sa.status,
          lastLoginAt: sa.lastLoginAt,
        },
      });
    }

    // Regular database users
    const result = await DatabaseService.query(
      `SELECT id, email, name, role, status, last_login, created_at FROM ${schema}.system_users WHERE id = $1`,
      [req.user.userId]
    );
    const user = result.rows[0];
    if (!user) {
      logger.warn(`[${requestId}] /auth/me — user not found`, { userId: req.user.userId });
      return res.status(404).json({
        success: false,
        error: { message: errors.errors.authUserNotFound, requestId },
      });
    }
    res.json({ success: true, data: { ...user, authMethod: 'database' } });
  } catch (err) {
    const msg = err.message || 'Failed to load user profile';
    logger.error(`[${requestId}] /auth/me failed — ${msg}`, { error: msg, requestId });
    const isDbDown = err.code === 'ECONNREFUSED' || /connect|ECONNREFUSED/i.test(msg);
    res.status(isDbDown ? 503 : 500).json({
      success: false,
      error: { message: isDbDown ? errors.errors.authDbUnavailable : msg, requestId },
    });
  }
});

export default router;
