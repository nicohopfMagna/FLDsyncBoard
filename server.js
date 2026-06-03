// Define hashPassword at the top
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(plain || ''), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  const value = String(stored || '');
  if (!value) return false;

  const parts = value.split(':');
  if (parts.length !== 2) {
    // Backward compatibility for legacy plain-text records.
    return value === String(plain || '');
  }

  const [salt, expectedHash] = parts;
  const actualHash = crypto.pbkdf2Sync(String(plain || ''), salt, 120000, 32, 'sha256').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));
  } catch {
    return false;
  }
}

// Define normalizePermissions
function normalizePermissions(list) {
  const input = Array.isArray(list)
    ? list
    : String(list || '').split(',').map((x) => x.trim()).filter(Boolean);
  const unique = [...new Set(input.filter((p) => ALL_PERMISSIONS.includes(p)))];
  return unique;
}

// server.js
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { createLogger, createRequestLogger } = require('./logger');
const {
  writePoint,
  query,
  initDb,
  getRelationalIntegrityReport,
  repairRelationalIntegrity
} = require('./sql-db');
const { publishMasterdata } = require('./mqtt');
const {
  connectExplorer,
  disconnectExplorer,
  subscribeTopic,
  unsubscribeTopic,
  publishMessage,
  getExplorerMessages,
  clearExplorerMessages,
  getExplorerStatus
} = require('./mqtt-explorer');

const app = express();
const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);
const appLogger = createLogger({ service: 'api' });
const API_TOKEN = process.env.API_TOKEN || 'dev-token';
const SERVICE_USER = process.env.API_SERVICE_USER || 'serviceUserFLDNoderedDEN';
const SERVICE_PASSWORD = process.env.API_SERVICE_PASSWORD || 'FLD';
const ADMIN_USER = process.env.API_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.API_ADMIN_PASSWORD || 'admin';
const REPORT_USER = process.env.API_REPORT_USER || 'report';
const REPORT_PASSWORD = process.env.API_REPORT_PASSWORD || 'report';
const API_ENFORCE_REPORT_DEFAULTS = String(process.env.API_ENFORCE_REPORT_DEFAULTS || 'true').toLowerCase() === 'true';
const AUTH_PROVIDER = String(process.env.AUTH_PROVIDER || 'ad-header').toLowerCase();
const API_AUTH_ALLOW_LEGACY = String(process.env.API_AUTH_ALLOW_LEGACY || 'false').toLowerCase() === 'true';
const ACCESS_TOKEN_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL_MS || (15 * 60 * 1000));
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || (8 * 60 * 60 * 1000));
const OTP_STEP_SECONDS = Number(process.env.OTP_STEP_SECONDS || 30);
const OTP_WINDOW_PAST = Number(process.env.OTP_WINDOW_PAST || 4);
const OTP_WINDOW_FUTURE = Number(process.env.OTP_WINDOW_FUTURE || 4);
const OTP_SHARED_SECRET = String(process.env.OTP_SHARED_SECRET || '');
const OTP_REQUIRED_FOR_ALL_LOGINS = String(process.env.OTP_REQUIRED_FOR_ALL_LOGINS || 'false').toLowerCase() === 'true';
const OTP_REQUIRED_FOR_ADMIN = String(process.env.OTP_REQUIRED_FOR_ADMIN || 'false').toLowerCase() === 'true';
const AD_ALLOWED_GROUPS = String(process.env.AD_ALLOWED_GROUPS || 'FLD_API_USERS').split(',').map((x) => x.trim()).filter(Boolean);
const AD_ADMIN_GROUPS = String(process.env.AD_ADMIN_GROUPS || 'FLD_API_ADMINS').split(',').map((x) => x.trim()).filter(Boolean);
const ENTRA_TENANT_ID = String(process.env.ENTRA_TENANT_ID || 'common').trim();
const ENTRA_CLIENT_ID = String(process.env.ENTRA_CLIENT_ID || '').trim();
const ENTRA_CLIENT_SECRET = String(process.env.ENTRA_CLIENT_SECRET || '').trim();
const ENTRA_AUTHORITY = String(process.env.ENTRA_AUTHORITY || `https://login.microsoftonline.com/${ENTRA_TENANT_ID}`).trim();
const ENTRA_ISSUER = String(process.env.ENTRA_ISSUER || `${ENTRA_AUTHORITY}/v2.0`).trim();
const ENTRA_ALLOW_UNMAPPED_USERS = String(process.env.ENTRA_ALLOW_UNMAPPED_USERS || 'false').toLowerCase() === 'true';
const ENTRA_ALLOWED_AUDIENCES = String(process.env.ENTRA_ALLOWED_AUDIENCES || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const ENTRA_OBO_DEFAULT_SCOPES = String(process.env.ENTRA_OBO_DEFAULT_SCOPES || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const ENTRA_ENABLED = Boolean(ENTRA_CLIENT_ID);
const ENTRA_EXPECTED_AUDIENCES = ENTRA_ALLOWED_AUDIENCES.length
  ? ENTRA_ALLOWED_AUDIENCES
  : [`api://${ENTRA_CLIENT_ID}`, ENTRA_CLIENT_ID].filter(Boolean);
const ENTRA_FRONTEND_SCOPES = String(
  process.env.ENTRA_FRONTEND_SCOPES
  || (ENTRA_CLIENT_ID ? `api://${ENTRA_CLIENT_ID}/user_impersonation` : '')
)
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const ENTRA_REDIRECT_URI = String(process.env.ENTRA_REDIRECT_URI || '').trim();
const MANAGE_USERS_PERMISSION = 'user.manage';
const ALL_PERMISSIONS = [
  'user.manage',
  'masterdata.read',
  'masterdata.write',
  'shift.assign',
  'system.repair',
  'system.health',
  'api.catalog.test'
];
const SIMPLE_ROLES = ['admin', 'user'];
const SPECIAL_ADMIN_GROUP = 'FLD_SPECIAL_ADMINS';

function roleDefaultPermissions(role) {
  if (String(role || '').toLowerCase() === 'admin') {
    return ALL_PERMISSIONS;
  }
  return ['masterdata.read', 'system.health', 'api.catalog.test'];
}

const localUsers = new Map();
const entraJwksClient = ENTRA_ENABLED
  ? jwksRsa({
      jwksUri: `${ENTRA_AUTHORITY}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxEntries: 10,
      cacheMaxAge: 10 * 60 * 1000,
      rateLimit: true,
      jwksRequestsPerMinute: 10
    })
  : null;

function normalizeRole(role) {
  return SIMPLE_ROLES.includes(role) ? role : 'user';
}

function normalizeGroups(groups) {
  if (Array.isArray(groups)) {
    return groups.map((g) => String(g || '').trim()).filter(Boolean);
  }
  return String(groups || '')
    .split(/[;,]/)
    .map((g) => g.trim())
    .filter(Boolean);
}

function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.map((s) => String(s || '').trim()).filter(Boolean);
  }
  return String(scopes || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function assignGroupsToUser(user, groups) {
  user.groups = normalizeGroups(groups);
}

function upsertLocalUser({ username, password, role = 'user', groups = [], permissions, enabled = true, source = 'local-default' }) {
  const normalizedUser = String(username || '').trim();
  if (!normalizedUser) return;
  const normalizedRole = normalizeRole(role);
  const now = new Date().toISOString();
  const existing = localUsers.get(normalizedUser);
  localUsers.set(normalizedUser, {
    username: normalizedUser,
    passwordHash: password ? hashPassword(password) : existing?.passwordHash || '',
    role: normalizedRole,
    groups: normalizeGroups(groups),
    permissions: normalizePermissions(permissions || roleDefaultPermissions(normalizedRole)),
    enabled: enabled !== false,
    source,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  });
}

async function saveUserToDb(userRecord) {
  await query(
    `
      UPDATE dbo.auth_users
      SET password_hash = $1, role = $2, enabled = $3, source = $4, updated_at = SYSUTCDATETIME()
      WHERE username = $5
    `,
    [
      userRecord.passwordHash,
      userRecord.role,
      userRecord.enabled === true,
      userRecord.source || 'manual',
      userRecord.username
    ]
  );

  const check = await query(`SELECT username FROM dbo.auth_users WHERE username = $1`, [userRecord.username]);
  if (!check.rows || check.rows.length === 0) {
    await query(
      `
        INSERT INTO dbo.auth_users (username, password_hash, role, enabled, source)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        userRecord.username,
        userRecord.passwordHash,
        userRecord.role,
        userRecord.enabled === true,
        userRecord.source || 'manual'
      ]
    );
  }

  await query(`DELETE FROM dbo.auth_user_permissions WHERE username = $1`, [userRecord.username]);
  for (const permission of normalizePermissions(userRecord.permissions || [])) {
    await query(
      `
        INSERT INTO dbo.auth_user_permissions (username, permission)
        VALUES ($1, $2)
      `,
      [userRecord.username, permission]
    );
  }
}

async function deleteUserFromDb(username) {
  await query(`DELETE FROM dbo.auth_users WHERE username = $1`, [username]);
}

async function loadLocalUsersFromDb() {
  localUsers.clear();
  const usersResult = await query(
    `
      SELECT username, password_hash AS passwordHash, role, enabled, source, created_at AS createdAt, updated_at AS updatedAt
      FROM dbo.auth_users
      ORDER BY username ASC
    `
  );

  const permsResult = await query(
    `
      SELECT username, permission
      FROM dbo.auth_user_permissions
      ORDER BY username ASC
    `
  );

  const permsByUser = new Map();
  for (const row of permsResult.rows || []) {
    const key = String(row.username || '');
    if (!key) continue;
    if (!permsByUser.has(key)) permsByUser.set(key, []);
    permsByUser.get(key).push(String(row.permission || '').trim());
  }

  for (const row of usersResult.rows || []) {
    const username = String(row.username || '').trim();
    if (!username) continue;
    localUsers.set(username, {
      username,
      passwordHash: String(row.passwordHash || ''),
      role: String(row.role || 'user') === 'admin' ? 'admin' : 'user',
      permissions: normalizePermissions(permsByUser.get(username) || roleDefaultPermissions(row.role)),
      enabled: row.enabled === true,
      source: String(row.source || 'manual'),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString()
    });
  }
}

async function ensureDefaultLocalUsers() {
  const defaults = [
    {
      username: SERVICE_USER,
      password: SERVICE_PASSWORD,
      role: 'admin',
      permissions: ALL_PERMISSIONS,
      source: 'service-default'
    },
    {
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      role: 'admin',
      permissions: ALL_PERMISSIONS,
      source: 'admin-default'
    },
    {
      username: REPORT_USER,
      password: REPORT_PASSWORD,
      role: 'user',
      permissions: ['masterdata.read', 'system.health', 'api.catalog.test'],
      source: 'report-default'
    }
  ];

  for (const def of defaults) {
    const shouldUpsert = def.source === 'report-default'
      ? API_ENFORCE_REPORT_DEFAULTS || !localUsers.has(def.username)
      : !localUsers.has(def.username);

    if (shouldUpsert) {
      upsertLocalUser(def);
      await saveUserToDb(localUsers.get(def.username));
    }
  }
}

const accessSessions = new Map();
const refreshSessions = new Map();

function safeNow() {
  return Date.now();
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function parseAdContext(req) {
  const user = String(req.headers['x-auth-user'] || req.headers['x-ms-client-principal-name'] || '').trim();
  const groups = normalizeGroups(req.headers['x-auth-groups'] || req.headers['x-ms-client-principal-groups'] || '');
  const source = String(req.headers['x-auth-source'] || 'activedirectory').trim().toLowerCase();
  return { user, groups, source };
}

function groupRole(groups) {
  const normalizedGroups = normalizeGroups(groups);
  if (normalizedGroups.includes(SPECIAL_ADMIN_GROUP)) {
    return 'admin';
  }
  const inAdmin = normalizedGroups.some((g) => AD_ADMIN_GROUPS.includes(g));
  if (inAdmin) return 'admin';
  const inAllowed = normalizedGroups.some((g) => AD_ALLOWED_GROUPS.includes(g));
  return inAllowed ? 'user' : '';
}

function roleFromEntraClaims(claims, groups) {
  const roles = Array.isArray(claims?.roles)
    ? claims.roles.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (roles.includes('admin') || roles.includes('fld_api_admin') || roles.includes('fld_api_admins')) {
    return 'admin';
  }
  const viaGroups = groupRole(groups);
  if (viaGroups) return viaGroups;
  return ENTRA_ALLOW_UNMAPPED_USERS ? 'user' : '';
}

async function verifyEntraAccessToken(token) {
  if (!ENTRA_ENABLED) {
    throw new Error('Entra auth is not configured. Set ENTRA_CLIENT_ID.');
  }
  if (!token) {
    throw new Error('Missing Entra access token.');
  }

  const verified = await new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        if (!entraJwksClient) {
          callback(new Error('JWKS client is not configured.'));
          return;
        }
        entraJwksClient.getSigningKey(header.kid, (err, key) => {
          if (err) {
            callback(err);
            return;
          }
          callback(null, key?.getPublicKey());
        });
      },
      {
        algorithms: ['RS256'],
        audience: ENTRA_EXPECTED_AUDIENCES,
        issuer: ENTRA_ISSUER
      },
      (err, payload) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(payload || {});
      }
    );
  });

  const claims = verified || {};
  const groups = normalizeGroups(claims.groups || []);
  const role = roleFromEntraClaims(claims, groups);
  if (!role) {
    throw new Error('User is not mapped to allowed Entra groups/roles.');
  }

  const user = String(
    claims.preferred_username
    || claims.upn
    || claims.email
    || claims.unique_name
    || claims.oid
    || claims.sub
    || ''
  ).trim();
  if (!user) {
    throw new Error('Entra token does not contain a usable user identifier.');
  }

  return {
    claims,
    user,
    role,
    groups,
    permissions: roleDefaultPermissions(role)
  };
}

async function acquireEntraOboToken(assertion, scopes) {
  if (!ENTRA_ENABLED || !ENTRA_CLIENT_SECRET) {
    throw new Error('OBO is not configured. Set ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET.');
  }

  const scopeList = normalizeScopes(scopes);
  if (!scopeList.length) {
    throw new Error('At least one OBO scope is required.');
  }

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: ENTRA_CLIENT_ID,
      clientSecret: ENTRA_CLIENT_SECRET,
      authority: ENTRA_AUTHORITY
    }
  });

  const result = await cca.acquireTokenOnBehalfOf({
    oboAssertion: assertion,
    scopes: scopeList,
    skipCache: false
  });

  if (!result?.accessToken) {
    throw new Error('Failed to acquire OBO token from Entra ID.');
  }

  return result;
}

function pruneSessions() {
  const now = safeNow();
  for (const [token, entry] of accessSessions.entries()) {
    if (!entry || entry.expiresAt <= now) accessSessions.delete(token);
  }
  for (const [token, entry] of refreshSessions.entries()) {
    if (!entry || entry.expiresAt <= now) refreshSessions.delete(token);
  }
}

function createSessionTokens(payload) {
  pruneSessions();
  const sid = crypto.randomUUID();
  const now = safeNow();

  const accessToken = randomToken();
  const refreshToken = randomToken();
  const accessExpiresAt = now + ACCESS_TOKEN_TTL_MS;
  const refreshExpiresAt = now + REFRESH_TOKEN_TTL_MS;

  const sessionBase = {
    sid,
    user: payload.user,
    role: payload.role,
    groups: payload.groups || [],
    permissions: normalizePermissions(payload.permissions || roleDefaultPermissions(payload.role || 'user')),
    provider: payload.provider || AUTH_PROVIDER,
    source: payload.source || 'local',
    upstreamAccessToken: payload.upstreamAccessToken || ''
  };

  accessSessions.set(accessToken, {
    ...sessionBase,
    tokenType: 'access',
    refreshToken,
    expiresAt: accessExpiresAt
  });

  refreshSessions.set(refreshToken, {
    ...sessionBase,
    tokenType: 'refresh',
    accessToken,
    expiresAt: refreshExpiresAt
  });

  return {
    tokenType: 'Bearer',
    sessionId: sid,
    accessToken,
    accessTokenExpiresInMs: ACCESS_TOKEN_TTL_MS,
    refreshToken,
    refreshTokenExpiresInMs: REFRESH_TOKEN_TTL_MS,
    role: sessionBase.role,
    user: sessionBase.user,
    groups: sessionBase.groups,
    permissions: sessionBase.permissions
  };
}

function hasPermission(auth, permission) {
  if (!auth) return false;
  if (auth.role === 'admin') return true;
  return Array.isArray(auth.permissions) && auth.permissions.includes(permission);
}

function ensureAdminAuth(req, res) {
  if (!isAuthorized(req)) {
    sendAuthError(res, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized.', { retryable: false });
    return false;
  }
  if (!hasPermission(req.auth, MANAGE_USERS_PERMISSION)) {
    sendAuthError(res, 403, 'AUTH_ADMIN_PERMISSION_REQUIRED', 'Admin permission required.', { retryable: false });
    return false;
  }
  return true;
}

const AUTH_API_CONTRACT_VERSION = '2026-06-02';

function getEntraCapabilityState() {
  if (!ENTRA_ENABLED) return 'not-configured';
  if (!ENTRA_CLIENT_ID) return 'not-configured';
  return 'ready';
}

function getAuthCapabilities() {
  const entraState = getEntraCapabilityState();
  return {
    authContractVersion: AUTH_API_CONTRACT_VERSION,
    providers: {
      local: { state: 'ready' },
      adHeader: { state: 'ready' },
      entra: {
        state: entraState,
        oboState: ENTRA_CLIENT_SECRET ? 'ready' : 'not-configured'
      }
    }
  };
}

function sendAuthError(res, httpStatus, code, message, options = {}) {
  return res.status(httpStatus).json({
    status: 'error',
    contractVersion: AUTH_API_CONTRACT_VERSION,
    code,
    error: message,
    message,
    retryable: options.retryable === true,
    details: options.details || null
  });
}

function base32ToBuffer(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(input || '').toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const c of clean) {
    const idx = alphabet.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, counter) {
  const key = base32ToBuffer(secret);
  if (!key.length) return '';
  const buf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter % 0x100000000;
  buf.writeUInt32BE(high, 0);
  buf.writeUInt32BE(low, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function verifyOneTimeCode(inputCode) {
  if (!OTP_SHARED_SECRET) return true;
  const code = String(inputCode || '').trim();
  if (!/^\d{6}$/.test(code)) return false;
  const nowCounter = Math.floor(safeNow() / (OTP_STEP_SECONDS * 1000));
  for (let i = -OTP_WINDOW_PAST; i <= OTP_WINDOW_FUTURE; i++) {
    const candidate = totpCode(OTP_SHARED_SECRET, nowCounter + i);
    if (candidate && candidate === code) return true;
  }
  return false;
}

function validateOneTimeCodeForRole(inputCode, role) {
  const isAdmin = role === 'admin';
  const requireOtp = OTP_REQUIRED_FOR_ALL_LOGINS || (OTP_REQUIRED_FOR_ADMIN && isAdmin);
  if (!requireOtp) {
    return { ok: true };
  }
  if (!OTP_SHARED_SECRET) {
    return { ok: false, message: 'OTP policy is enabled but OTP_SHARED_SECRET is not configured.' };
  }
  if (!verifyOneTimeCode(inputCode)) {
    return { ok: false, message: 'Invalid one-time code for current 4+4 window.' };
  }
  return { ok: true };
}

app.use(express.static(__dirname));
app.use(express.json());
app.use(createRequestLogger(appLogger));

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return authHeader.slice(7).trim();
}

function extractBasicCredentials(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('basic ')) {
    return null;
  }
  const encoded = authHeader.slice(6).trim();
  if (!encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const splitIndex = decoded.indexOf(':');
    if (splitIndex < 0) {
      return null;
    }
    return {
      user: decoded.slice(0, splitIndex),
      password: decoded.slice(splitIndex + 1)
    };
  } catch (_) {
    return null;
  }
}

function isAuthorized(req) {
  const bearerToken = extractBearerToken(req);
  if (bearerToken && accessSessions.has(bearerToken)) {
    const session = accessSessions.get(bearerToken);
    if (session && session.expiresAt > safeNow()) {
      req.auth = {
        user: session.user,
        role: session.role,
        groups: session.groups,
        permissions: session.permissions || [],
        provider: session.provider,
        entraAccessToken: session.upstreamAccessToken || '',
        sid: session.sid,
        mode: 'session-token'
      };
      return true;
    }
    accessSessions.delete(bearerToken);
  }

  if (API_AUTH_ALLOW_LEGACY && bearerToken && bearerToken === API_TOKEN) {
    req.auth = {
      user: 'legacy-token',
      role: 'admin',
      permissions: ALL_PERMISSIONS,
      provider: 'legacy',
      sid: null,
      mode: 'legacy-bearer'
    };
    return true;
  }

  if (!API_AUTH_ALLOW_LEGACY) {
    return false;
  }

  const basicCredentials = extractBasicCredentials(req);
  if (!basicCredentials) {
    return false;
  }

  const localUser = localUsers.get(basicCredentials.user);
  if (localUser && localUser.enabled && verifyPassword(basicCredentials.password, localUser.passwordHash)) {
    req.auth = {
      user: localUser.username,
      role: localUser.role,
      permissions: localUser.permissions,
      provider: 'legacy',
      sid: null,
      mode: 'legacy-basic'
    };
    return true;
  }

  return false;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const provider = String(req.body?.provider || AUTH_PROVIDER || 'ad-header').toLowerCase();
    const oneTimeCode = String(req.body?.oneTimeCode || '').trim();

    if (provider === 'entra' || provider === 'entraid' || provider === 'azuread') {
      const rawToken = String(req.body?.accessToken || '').trim() || extractBearerToken(req);
      if (!rawToken) {
        return sendAuthError(
          res,
          400,
          'ENTRA_ACCESS_TOKEN_REQUIRED',
          'Entra accessToken is required for provider=entra.',
          { retryable: false }
        );
      }

      let verified;
      try {
        verified = await verifyEntraAccessToken(rawToken);
      } catch (verifyErr) {
        return sendAuthError(
          res,
          401,
          'ENTRA_ACCESS_TOKEN_INVALID',
          verifyErr.message || 'Invalid Entra access token.',
          { retryable: false }
        );
      }

      const otpResult = validateOneTimeCodeForRole(oneTimeCode, verified.role);
      if (!otpResult.ok) {
        return sendAuthError(res, 401, 'AUTH_OTP_INVALID', otpResult.message, { retryable: true });
      }

      return res.json({
        status: 'ok',
        contractVersion: AUTH_API_CONTRACT_VERSION,
        provider: 'entra',
        ...createSessionTokens({
          user: verified.user,
          role: verified.role,
          groups: verified.groups,
          permissions: verified.permissions,
          provider: 'entra',
          source: 'entra-app-registration',
          upstreamAccessToken: rawToken
        })
      });
    }

    if (provider === 'ad-header' || provider === 'matrix42' || provider === 'activedirectory') {
      const ad = parseAdContext(req);
      if (!ad.user) {
        return sendAuthError(
          res,
          400,
          'AD_HEADER_USER_MISSING',
          'Missing AD user headers (x-auth-user).',
          { retryable: false }
        );
      }
      const role = groupRole(ad.groups);
      if (!role) {
        return sendAuthError(res, 403, 'AD_GROUP_NOT_ALLOWED', 'User is not in allowed AD groups.', { retryable: false });
      }
      const otpResult = validateOneTimeCodeForRole(oneTimeCode, role);
      if (!otpResult.ok) {
        return sendAuthError(res, 401, 'AUTH_OTP_INVALID', otpResult.message, { retryable: true });
      }
      return res.json({
        status: 'ok',
        contractVersion: AUTH_API_CONTRACT_VERSION,
        provider: 'ad-header',
        ...createSessionTokens({
          user: ad.user,
          role,
          groups: ad.groups,
          provider: 'ad-header',
          source: ad.source || provider
        })
      });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    let matched = localUsers.get(username);

    // Self-heal report account so report/report stays available as requested.
    if (username === REPORT_USER && password === REPORT_PASSWORD
      && (!matched || !matched.enabled || !verifyPassword(password, matched.passwordHash))) {
      upsertLocalUser({
        username: REPORT_USER,
        password: REPORT_PASSWORD,
        role: 'user',
        permissions: ['masterdata.read', 'system.health', 'api.catalog.test'],
        source: 'report-self-heal'
      });
      await saveUserToDb(localUsers.get(REPORT_USER));
      matched = localUsers.get(REPORT_USER);
    }

    if (!matched || !matched.enabled || !verifyPassword(password, matched.passwordHash)) {
      return sendAuthError(res, 401, 'AUTH_INVALID_CREDENTIALS', 'Invalid username or password.', { retryable: true });
    }
    const otpResult = validateOneTimeCodeForRole(oneTimeCode, matched.role);
    if (!otpResult.ok) {
      return sendAuthError(res, 401, 'AUTH_OTP_INVALID', otpResult.message, { retryable: true });
    }

    return res.json({
      status: 'ok',
      contractVersion: AUTH_API_CONTRACT_VERSION,
      provider: 'local',
      ...createSessionTokens({
        user: matched.username,
        role: matched.role,
        groups: matched.role === 'admin' ? AD_ADMIN_GROUPS : AD_ALLOWED_GROUPS,
        permissions: matched.permissions,
        provider: 'local',
        source: 'local'
      })
    });
  } catch (err) {
    return sendAuthError(res, 500, 'AUTH_LOGIN_FAILED', err.message || 'Login failed.', { retryable: true });
  }
});

app.post('/api/auth/refresh', (req, res) => {
  try {
    pruneSessions();
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken || !refreshSessions.has(refreshToken)) {
      return sendAuthError(res, 401, 'AUTH_REFRESH_TOKEN_INVALID', 'Invalid refresh token.', { retryable: false });
    }

    const refreshSession = refreshSessions.get(refreshToken);
    if (!refreshSession || refreshSession.expiresAt <= safeNow()) {
      refreshSessions.delete(refreshToken);
      return sendAuthError(res, 401, 'AUTH_REFRESH_TOKEN_EXPIRED', 'Refresh token expired.', { retryable: true });
    }

    if (refreshSession.accessToken) {
      accessSessions.delete(refreshSession.accessToken);
    }
    refreshSessions.delete(refreshToken);

    return res.json({
      status: 'ok',
      contractVersion: AUTH_API_CONTRACT_VERSION,
      ...createSessionTokens({
        user: refreshSession.user,
        role: refreshSession.role,
        groups: refreshSession.groups,
        permissions: refreshSession.permissions,
        provider: refreshSession.provider,
        source: refreshSession.source
      })
    });
  } catch (err) {
    return sendAuthError(res, 500, 'AUTH_REFRESH_FAILED', err.message || 'Refresh failed.', { retryable: true });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return sendAuthError(res, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized.', { retryable: false });
    }
    const accessToken = extractBearerToken(req);
    const refreshToken = String(req.body?.refreshToken || '').trim();

    if (accessToken && accessSessions.has(accessToken)) {
      const current = accessSessions.get(accessToken);
      if (current?.refreshToken) {
        refreshSessions.delete(current.refreshToken);
      }
      accessSessions.delete(accessToken);
    }

    if (refreshToken && refreshSessions.has(refreshToken)) {
      const current = refreshSessions.get(refreshToken);
      if (current?.accessToken) {
        accessSessions.delete(current.accessToken);
      }
      refreshSessions.delete(refreshToken);
    }

    return res.json({ status: 'ok', contractVersion: AUTH_API_CONTRACT_VERSION });
  } catch (err) {
    return sendAuthError(res, 500, 'AUTH_LOGOUT_FAILED', err.message || 'Logout failed.', { retryable: true });
  }
});

app.post('/api/auth/entra/obo', async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return sendAuthError(res, 401, 'AUTH_UNAUTHORIZED', 'Unauthorized.', { retryable: false });
    }

    const scopes = normalizeScopes(req.body?.scopes || req.body?.scope || ENTRA_OBO_DEFAULT_SCOPES);
    if (!scopes.length) {
      return sendAuthError(res, 400, 'ENTRA_OBO_SCOPE_REQUIRED', 'At least one scope is required for OBO.', { retryable: false });
    }

    let assertion = String(req.auth?.entraAccessToken || '').trim();
    if (!assertion && req.auth?.mode === 'session-token') {
      const currentSession = accessSessions.get(extractBearerToken(req));
      assertion = String(currentSession?.upstreamAccessToken || '').trim();
    }

    if (!assertion) {
      return sendAuthError(
        res,
        400,
        'ENTRA_OBO_ASSERTION_MISSING',
        'No Entra assertion available. Login with provider=entra or provide a direct Entra bearer token.',
        { retryable: false }
      );
    }

    const result = await acquireEntraOboToken(assertion, scopes);
    return res.json({
      status: 'ok',
      contractVersion: AUTH_API_CONTRACT_VERSION,
      provider: 'entra-obo',
      scopes,
      expiresOn: result.expiresOn || null,
      accessToken: result.accessToken
    });
  } catch (err) {
    return sendAuthError(res, 500, 'ENTRA_OBO_FAILED', err.message || 'Entra OBO failed.', { retryable: true });
  }
});

app.get('/api/auth/entra/config', (req, res) => {
  const capabilities = getAuthCapabilities();
  return res.json({
    contractVersion: AUTH_API_CONTRACT_VERSION,
    state: capabilities.providers.entra.state,
    enabled: ENTRA_ENABLED,
    tenantId: ENTRA_TENANT_ID,
    clientId: ENTRA_CLIENT_ID || '',
    authority: ENTRA_AUTHORITY,
    issuer: ENTRA_ISSUER,
    expectedAudiences: ENTRA_EXPECTED_AUDIENCES,
    scopes: ENTRA_FRONTEND_SCOPES,
    redirectUri: ENTRA_REDIRECT_URI || null,
    oboConfigured: Boolean(ENTRA_CLIENT_ID && ENTRA_CLIENT_SECRET),
    capabilities: capabilities.providers.entra
  });
});

app.get('/api/auth/sessions', (req, res) => {
  pruneSessions();
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const sessions = Array.from(accessSessions.values()).map((s) => ({
    sid: s.sid,
    user: s.user,
    role: s.role,
    provider: s.provider,
    source: s.source,
    expiresAt: s.expiresAt
  }));
  return res.json(sessions);
});

app.get('/api/auth/users', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const users = Array.from(localUsers.values()).map((u) => ({
    username: u.username,
    role: u.role,
    permissions: u.permissions,
    enabled: u.enabled,
    source: u.source,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  }));
  res.json(users);
});

app.post('/api/auth/users', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '').trim();
  const role = String(req.body?.role || 'user').trim() === 'admin' ? 'admin' : 'user';
  const enabled = req.body?.enabled !== false;
  const permissions = normalizePermissions(req.body?.permissions || roleDefaultPermissions(role));

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (localUsers.has(username)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  upsertLocalUser({ username, password, role, permissions, enabled, source: 'manual' });
  await saveUserToDb(localUsers.get(username));
  return res.status(201).json({ status: 'ok' });
});

app.patch('/api/auth/users/:username', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const username = String(req.params.username || '').trim();
  if (!username || !localUsers.has(username)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const existing = localUsers.get(username);
  const nextRole = req.body?.role != null
    ? (String(req.body.role).trim() === 'admin' ? 'admin' : 'user')
    : existing.role;
  const nextEnabled = req.body?.enabled != null ? req.body.enabled === true : existing.enabled;
  const nextPermissions = req.body?.permissions != null
    ? normalizePermissions(req.body.permissions)
    : existing.permissions;

  if (req.body?.password) {
    existing.passwordHash = hashPassword(String(req.body.password));
  }

  existing.role = nextRole;
  existing.enabled = nextEnabled;
  existing.permissions = nextPermissions.length ? nextPermissions : roleDefaultPermissions(nextRole);
  existing.updatedAt = new Date().toISOString();
  localUsers.set(username, existing);
  await saveUserToDb(existing);

  return res.json({ status: 'ok' });
});

app.post('/api/auth/users/:username/grant', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const username = String(req.params.username || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!username || !localUsers.has(username)) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!ALL_PERMISSIONS.includes(permission)) {
    return res.status(400).json({ error: 'Unknown permission' });
  }
  const user = localUsers.get(username);
  user.permissions = [...new Set([...(user.permissions || []), permission])];
  user.updatedAt = new Date().toISOString();
  localUsers.set(username, user);
  await saveUserToDb(user);
  return res.json({ status: 'ok' });
});

app.post('/api/auth/users/:username/revoke', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const username = String(req.params.username || '').trim();
  const permission = String(req.body?.permission || '').trim();
  if (!username || !localUsers.has(username)) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!ALL_PERMISSIONS.includes(permission)) {
    return res.status(400).json({ error: 'Unknown permission' });
  }
  const user = localUsers.get(username);
  user.permissions = (user.permissions || []).filter((p) => p !== permission);
  user.updatedAt = new Date().toISOString();
  localUsers.set(username, user);
  await saveUserToDb(user);
  return res.json({ status: 'ok' });
});

app.delete('/api/auth/users/:username', async (req, res) => {
  if (!ensureAdminAuth(req, res)) {
    return;
  }
  const username = String(req.params.username || '').trim();
  if (!username || !localUsers.has(username)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const existing = localUsers.get(username);
  if (existing.role === 'admin') {
    const adminCount = Array.from(localUsers.values()).filter((u) => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete last admin user' });
    }
  }

  if (req.auth?.user && req.auth.user === username) {
    return res.status(400).json({ error: 'Cannot delete currently authenticated user' });
  }

  localUsers.delete(username);
  await deleteUserFromDb(username);
  return res.json({ status: 'ok' });
});

function requiredPermissionForRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || '');

  if (path === '/auth/status' || path === '/auth/login' || path === '/auth/refresh' || path === '/auth/logout') {
    return null;
  }

  if (path === '/auth/sessions' || path === '/auth/users' || path.startsWith('/auth/users/')) {
    return MANAGE_USERS_PERMISSION;
  }

  if (method === 'POST' && path === '/sql-integrity-repair') return 'system.repair';
  if (method === 'GET' && path === '/sql-integrity') return 'system.health';
  if (path.startsWith('/mqtt-explorer')) return 'api.catalog.test';

  if (method === 'POST' && path === '/assign-shift') return 'shift.assign';
  if (method === 'GET' && (path === '/shifts' || path === '/shift-schedule' || path === '/shift-data' || path === '/shift-modells')) return 'masterdata.read';

  if (method === 'GET' && (path === '/stations' || path === '/stationSetting' || path === '/lines' || path === '/time-events')) return 'masterdata.read';
  if (method === 'GET' && path === '/masterdata-templates') return 'masterdata.read';
  if (method === 'GET' && /^\/masterdata-templates\/\d+$/.test(path)) return 'masterdata.read';
  if (method === 'PATCH' && /^\/masterdata-templates\/\d+\/plant$/.test(path)) return 'masterdata.write';
  if (method === 'GET' && /^\/lines\/[^/]+\/(stations|bottlenecks|bottleneck-cycle-time)$/.test(path)) return 'masterdata.read';
  if (method === 'GET' && /^\/stations\/[^/]+\/cycle-time$/.test(path)) return 'masterdata.read';
  if (method === 'GET' && (path === '/uns/shift-schedule' || path === '/uns/break-schedule' || path === '/uns/cycle-time')) return 'masterdata.read';
  if (method === 'GET' && (path === '/contract/uns-shift-schedule' || path === '/contract/uns-break-schedule' || path === '/contract/uns-cycle-time')) return 'masterdata.read';
  if (method === 'GET' && (path === '/contract/shift-schedule-v1' || path === '/contract/break-schedule-v1' || path === '/contract/cycle-time-v1')) return 'masterdata.read';
  if (method === 'GET' && (path === '/fld/shift-schedule-v1' || path === '/fld/break-schedule-v1' || path === '/fld/cycle-time-v1' || path === '/fld/metadata-line-v1')) return 'masterdata.read';

  if (method === 'POST' && (path === '/station' || path === '/line' || path === '/shift' || path === '/point')) return 'masterdata.write';
  if (method === 'POST' && path === '/masterdata-template') return 'masterdata.write';

  return 'masterdata.read';
}

app.use('/api', (req, res, next) => {
  if (
    req.path === '/auth/status'
    || req.path === '/auth/login'
    || req.path === '/auth/refresh'
    || req.path === '/auth/entra/config'
  ) {
    return next();
  }

  if (!isAuthorized(req)) {
    res.status(401).json({
      error: 'Unauthorized: provide Authorization header (session token or configured legacy credentials).'
    });
    return;
  }

  const requiredPermission = requiredPermissionForRequest(req);
  if (requiredPermission && !hasPermission(req.auth, requiredPermission)) {
    return res.status(403).json({ error: `Forbidden: missing permission '${requiredPermission}'.` });
  }
  next();
});

app.use('/api/uns', (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET') {
    return next();
  }

  const legacyPath = String(req.path || '').trim();
  const mapping = {
    '/shift-schedule': '/api/fld/shift-schedule-v1',
    '/break-schedule': '/api/fld/break-schedule-v1',
    '/cycle-time': '/api/fld/cycle-time-v1'
  };

  const targetBase = mapping[legacyPath];
  if (!targetBase) {
    return next();
  }

  const query = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';
  const targetUrl = `${targetBase}${query}`;

  res.set('Deprecation', 'true');
  res.set('Sunset', 'Tue, 30 Jun 2026 23:59:59 GMT');
  res.set('Link', `<${targetUrl}>; rel="successor-version"`);
  res.set('X-API-Migration', 'Legacy UNS path is deprecated. Use /api/fld/*-v1 endpoints.');

  return res.redirect(307, targetUrl);
});

app.use('/api/fld', async (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET') {
    return next();
  }

  const fldPath = String(req.path || '').trim();

  try {
    if (fldPath === '/shift-schedule-v1') {
      const stationId = String(req.query.stationId || '').trim();
      const lineId = String(req.query.lineId || '').trim();
      const timezone = String(req.query.timezone || '-1').trim() || '-1';

      if (!stationId && !lineId) {
        return res.status(400).json({ error: 'stationId or lineId required' });
      }

      const now = getNowInTimeZone(timezone);
      const nowMinutes = (now.hour * 60) + now.minute;
      const shifts = await loadShiftsForTarget({ stationId, lineId });
      const active = pickActiveOrFirstShift(shifts, nowMinutes);
      if (!active) {
        return res.status(404).json({ error: 'No shift found for target' });
      }

      const dt = buildShiftDateTimes(active, now);
      const lengthMinutes = computeDurationMinutes(active.start, active.end);

      return res.json({
        Version: FLD_API_VERSION,
        Timestamp: formatDateTimeWithOffset(new Date()),
        ShiftSchedule: {
          StartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
          EndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
          Length: lengthMinutes != null ? lengthMinutes : 0,
          ShiftID: toShiftIdValue(active.shiftId, active.shiftName),
          ShiftDesc: String(active.shiftName || '')
        }
      });
    }

    if (fldPath === '/break-schedule-v1') {
      const stationId = String(req.query.stationId || '').trim();
      const lineId = String(req.query.lineId || '').trim();
      const timezone = String(req.query.timezone || '-1').trim() || '-1';

      if (!stationId && !lineId) {
        return res.status(400).json({ error: 'stationId or lineId required' });
      }

      let targetShift = null;
      const now = getNowInTimeZone(timezone);
      const nowMinutes = (now.hour * 60) + now.minute;

      const shifts = await loadShiftsForTarget({ stationId, lineId });
      targetShift = pickActiveOrFirstShift(shifts, nowMinutes);

      const targetShiftName = String(targetShift?.shiftName || '').trim().toLowerCase();

      const source = await query(
        `
          SELECT fields
          FROM dbo.measurements
          WHERE measurement IN ('shift_modell', 'shift-modells', 'weekPlans', 'weekPlanSets')
          ORDER BY id DESC
        `
      );

      const breaks = [];
      for (const row of source.rows || []) {
        let parsed = null;
        try {
          parsed = JSON.parse(row.fields || '{}');
        } catch (_) {
          parsed = null;
        }
        if (!parsed) continue;

        const models = Array.isArray(parsed) ? parsed : [parsed];
        for (const model of models) {
          const entries = Array.isArray(model?.entries) ? model.entries : [];
          entries.forEach((entry, idx) => {
            const productive = parseFlexibleBoolean(entry?.productive);
            if (productive) return;

            const entryShiftName = String(entry?.shift || entry?.name || '').trim().toLowerCase();
            if (targetShiftName && entryShiftName && entryShiftName !== targetShiftName) {
              return;
            }

            const startText = String(entry?.start || entry?.breakStartTime || '').trim();
            const endText = String(entry?.end || entry?.breakEndTime || '').trim();
            if (!startText || !endText) return;

            const breakShift = { start: startText, end: endText };
            const dt = buildShiftDateTimes(breakShift, now);
            const lengthMinutes = computeDurationMinutes(startText, endText);

            breaks.push({
              BreakStartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
              BreakEndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
              Length: String(lengthMinutes != null ? lengthMinutes : (entry?.duration || '')),
              BreakID: String(entry?.breakId || entry?.id || (idx + 1)),
              BreakDesc: String(entry?.breakDesc || entry?.timeevent || entry?.description || `Break-${idx + 1}`)
            });
          });
        }
      }

      const dedup = [];
      const seen = new Set();
      for (const item of breaks) {
        const key = `${item.BreakStartTime}|${item.BreakEndTime}|${item.BreakDesc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(item);
      }

      return res.json({
        Version: FLD_API_VERSION,
        Timestamp: formatDateTimeWithOffset(new Date()),
        BreakSchedule: dedup
      });
    }

    if (fldPath === '/cycle-time-v1') {
      const lineId = String(req.query.lineId || '').trim();

      if (!lineId) {
        return res.status(400).json({ error: 'lineId required' });
      }

      let cycleValue = null;

      const result = await query(
        `
          SELECT TOP 1 s.cycle_time AS cycleTime
          FROM (
            SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
            FROM dbo.shift_assignments sa
            LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
            WHERE COALESCE(sa.line_id, sh.line_id) = $1

            UNION

            SELECT sh.line_id AS lineId, sh.station_id AS stationId
            FROM dbo.shifts sh
            WHERE sh.line_id = $1
          ) x
          INNER JOIN dbo.stations s ON s.id = x.stationId
          WHERE x.lineId = $1
            AND s.cycle_time IS NOT NULL
          ORDER BY ISNULL(s.bottleneck, 0) DESC, s.cycle_time ASC, s.id ASC
        `,
        [lineId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'No cycle time found for line' });
      }
      cycleValue = result.rows[0]?.cycleTime;

      return res.json({
        Version: FLD_API_VERSION,
        Timestamp: formatDateTimeWithOffset(new Date()),
        CycleTime: {
          Value: cycleValue != null ? String(Number(cycleValue)) : ''
        }
      });
    }

    if (fldPath === '/metadata-line-v1') {
      const lineId = String(req.query.lineId || '').trim();
      if (!lineId) {
        return res.status(400).json({ error: 'lineId required' });
      }

      const lineResult = await query(
        `
          SELECT id AS lineId, description AS lineName
          FROM dbo.lines
          WHERE id = $1
        `,
        [lineId]
      );
      if (!lineResult.rows.length) {
        return res.status(404).json({ error: 'Line not found' });
      }
      const lineName = String(lineResult.rows[0]?.lineName || lineId);

      const stationsResult = await query(
        `
          SELECT DISTINCT s.id AS stationId, ISNULL(s.bottleneck, 0) AS bottleneck, ISNULL(s.is_last_station, 0) AS lastStation, s.cycle_time AS cycleTime
          FROM (
            SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
            FROM dbo.shift_assignments sa
            LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
            WHERE COALESCE(sa.line_id, sh.line_id) = $1

            UNION

            SELECT sh.line_id AS lineId, sh.station_id AS stationId
            FROM dbo.shifts sh
            WHERE sh.line_id = $1
          ) x
          INNER JOIN dbo.stations s ON s.id = x.stationId
          WHERE x.lineId = $1
            AND x.stationId IS NOT NULL
          ORDER BY s.id ASC
        `,
        [lineId]
      );

      const stationIds = (stationsResult.rows || []).map((row) => String(row.stationId || '')).filter(Boolean);
      const bottleneckStationIds = (stationsResult.rows || [])
        .filter((row) => Number(row.bottleneck) === 1)
        .map((row) => String(row.stationId || ''))
        .filter(Boolean);
      const bottleneckCycleTimes = (stationsResult.rows || [])
        .filter((row) => Number(row.bottleneck) === 1 && row.cycleTime != null)
        .map((row) => ({
          StationId: String(row.stationId || ''),
          Value: String(Number(row.cycleTime))
        }))
        .filter((entry) => entry.StationId);
      const lastStationIds = (stationsResult.rows || [])
        .filter((row) => Number(row.lastStation) === 1)
        .map((row) => String(row.stationId || ''))
        .filter(Boolean);

      const bottleneckCycleRow = (stationsResult.rows || []).find((row) => Number(row.bottleneck) === 1 && row.cycleTime != null)
        || null;
      const cycleRow = bottleneckCycleRow
        || (stationsResult.rows || []).find((row) => row.cycleTime != null)
        || null;
      const cycleTime = cycleRow?.cycleTime != null
        ? String(Number(cycleRow.cycleTime))
        : '';

      return res.json({
        Version: FLD_API_VERSION,
        Timestamp: formatDateTimeWithOffset(new Date()),
        MetadataLine: {
          LineType: 'Assembly',
          LineName: lineName,
          StationIds: stationIds,
          BottleneckStationIds: bottleneckStationIds,
          BottleneckCycleTimes: bottleneckCycleTimes,
          LastStationId: lastStationIds,
          CycleTime: {
            Value: cycleTime
          }
        }
      });
    }

    return next();
  } catch (e) {
    if (String(e.message || '').includes('Invalid time zone')) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  const capabilities = getAuthCapabilities();
  res.json({
    contractVersion: AUTH_API_CONTRACT_VERSION,
    auth: ['session-token', 'ad-group-login', 'entra-session', 'legacy-bearer', 'legacy-basic'],
    authProvider: AUTH_PROVIDER,
    tokenConfigured: Boolean(API_TOKEN),
    serviceUserConfigured: Boolean(SERVICE_USER),
    adminUserConfigured: Boolean(ADMIN_USER),
    allowLegacy: API_AUTH_ALLOW_LEGACY,
    oneTimeCodeWindow: `${OTP_WINDOW_PAST}+${OTP_WINDOW_FUTURE}`,
    otpRequiredForAllLogins: OTP_REQUIRED_FOR_ALL_LOGINS,
    otpRequiredForAdmin: OTP_REQUIRED_FOR_ADMIN,
    otpConfigured: Boolean(OTP_SHARED_SECRET),
    adAllowedGroups: AD_ALLOWED_GROUPS,
    adAdminGroups: AD_ADMIN_GROUPS,
    entraEnabled: ENTRA_ENABLED,
    entraTenantId: ENTRA_TENANT_ID,
    entraClientIdConfigured: Boolean(ENTRA_CLIENT_ID),
    entraClientId: ENTRA_CLIENT_ID || '',
    entraAuthority: ENTRA_AUTHORITY,
    entraFrontendScopes: ENTRA_FRONTEND_SCOPES,
    entraOboConfigured: Boolean(ENTRA_CLIENT_ID && ENTRA_CLIENT_SECRET),
    entraExpectedAudiences: ENTRA_EXPECTED_AUDIENCES,
    entraDefaultOboScopes: ENTRA_OBO_DEFAULT_SCOPES,
    availablePermissions: ALL_PERMISSIONS,
    capabilities,
    hint: 'Login via /api/auth/login (local, AD headers, or provider=entra with Entra accessToken). Optional OBO: POST /api/auth/entra/obo.'
  });
});

function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return (hours * 60) + mins;
}

function computeDurationMinutes(startValue, endValue) {
  const start = parseTimeToMinutes(startValue);
  const end = parseTimeToMinutes(endValue);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function shiftMatchesMinutes(startValue, endValue, nowMinutes) {
  const start = parseTimeToMinutes(startValue);
  const end = parseTimeToMinutes(endValue);
  if (start == null || end == null) return false;

  if (start <= end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  return nowMinutes >= start || nowMinutes < end;
}

function getNowInTimeZone() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes()
  };
}

function pad2(v) {
  return String(v).padStart(2, '0');
}

function buildShiftDateTimes(shift, tzNow) {
  const dateBase = `${tzNow.year}-${pad2(tzNow.month)}-${pad2(tzNow.day)}`;
  const start = parseTimeToMinutes(shift.start);
  const end = parseTimeToMinutes(shift.end);

  let endDate = dateBase;
  if (start != null && end != null && end < start) {
    const d = new Date(tzNow.year, tzNow.month - 1, tzNow.day);
    d.setDate(d.getDate() + 1);
    endDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return {
    shiftStartDate: `${dateBase}T${shift.start}:00`,
    shiftEndDate: `${endDate}T${shift.end}:00`
  };
}

function normalizeLineShapeType(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return 'I-shape';

  const aliasMap = {
    i: 'I-shape',
    'i-shape': 'I-shape',
    l: 'L-shape',
    'l-shape': 'L-shape',
    u: 'U-shape',
    'u-shape': 'U-shape',
    o: 'O-shape',
    'o-shape': 'O-shape',
    s: 'S-shape',
    's-shape': 'S-shape',
    t: 'T-shape',
    't-shape': 'T-shape',
    cell: 'Cell-shape',
    'cell-shape': 'Cell-shape',
    // Legacy aliases mapped to the fixed shape catalog.
    ring: 'O-shape',
    'ring-shape': 'O-shape',
    other: 'I-shape',
    'other-shape': 'I-shape'
  };

  return aliasMap[raw] || 'I-shape';
}

function parseBoolean01(input, fieldName) {
  if (input === undefined || input === null || input === '') return { ok: true, value: false };
  if (input === true || input === 1 || String(input).toLowerCase() === 'true' || String(input) === '1') {
    return { ok: true, value: true };
  }
  if (input === false || input === 0 || String(input).toLowerCase() === 'false' || String(input) === '0') {
    return { ok: true, value: false };
  }
  return { ok: false, error: `${fieldName} must be boolean 0/1 (or true/false).` };
}

const UNS_API_VERSION = '1.0.0';
const FLD_API_VERSION = '3.0.0';

function formatDateTimeWithOffset(dateValue) {
  const d = dateValue instanceof Date ? dateValue : new Date();
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);

  const offsetMinutes = -d.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}.${ms}${sign}${offsetHours}${offsetMins}`;
}

function toIsoUtc(localDateTime) {
  if (!localDateTime) return null;
  const parsed = new Date(localDateTime);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateTimeWithOffset(parsed);
}

function parseFlexibleBoolean(value) {
  return value === true
    || value === 1
    || String(value || '').toLowerCase() === 'true'
    || String(value || '') === '1';
}

async function loadShiftsForTarget({ stationId, lineId }) {
  const fetchShifts = async ({ stationId: stationFilter, lineId: lineFilter }) => {
    let sqlText = `
      SELECT DISTINCT
        sh.id AS shiftId,
        sh.name AS shiftName,
        sh.start_time AS start,
        sh.end_time AS [end],
        sh.line_id AS lineId,
        sh.station_id AS stationId
      FROM dbo.shifts sh
      LEFT JOIN dbo.shift_assignments sa ON sa.shift_id = sh.id
      WHERE 1 = 1
    `;
    const params = [];

    if (stationFilter) {
      params.push(stationFilter);
      const placeholder = `$${params.length}`;
      sqlText += `
        AND (
          sh.station_id = ${placeholder}
          OR sa.station_id = ${placeholder}
          OR (sa.target_type = 'station' AND sa.target_id = ${placeholder})
        )
      `;
    }
    if (lineFilter) {
      params.push(lineFilter);
      const placeholder = `$${params.length}`;
      sqlText += `
        AND (
          sh.line_id = ${placeholder}
          OR sa.line_id = ${placeholder}
          OR (sa.target_type = 'line' AND sa.target_id = ${placeholder})
        )
      `;
    }

    sqlText += ` ORDER BY sh.id ASC`;
    const result = await query(sqlText, params);
    return result.rows || [];
  };

  let rows = await fetchShifts({ stationId: stationId || '', lineId: lineId || '' });
  if (rows.length || (!stationId && !lineId)) {
    return rows;
  }

  if (stationId && lineId) {
    rows = await fetchShifts({ stationId: '', lineId });
    if (rows.length) return rows;

    rows = await fetchShifts({ stationId, lineId: '' });
    if (rows.length) return rows;
  }

  return rows;
}

async function loadShiftsFromMeasurementsFallback() {
  const source = await query(
    `
      SELECT fields
      FROM dbo.measurements
      WHERE measurement IN ('shift_modell', 'shift-modells', 'weekPlans', 'weekPlanSets')
      ORDER BY id DESC
    `
  );

  const shifts = [];
  for (const row of source.rows || []) {
    let parsed = null;
    try {
      parsed = JSON.parse(row.fields || '{}');
    } catch (_) {
      parsed = null;
    }
    if (!parsed) continue;

    const models = Array.isArray(parsed) ? parsed : [parsed];
    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex];
      const entries = Array.isArray(model?.entries) ? model.entries : [];
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
        const entry = entries[entryIndex] || {};
        const start = String(entry.start || entry.shiftStartTime || '').trim();
        const end = String(entry.end || entry.shiftEndTime || '').trim();
        if (!start || !end) continue;

        const productiveRaw = entry.productive;
        const hasProductiveFlag = productiveRaw != null && String(productiveRaw).trim() !== '';
        if (hasProductiveFlag && !parseFlexibleBoolean(productiveRaw)) {
          continue;
        }

        shifts.push({
          shiftId: String(entry.shiftId || entry.id || `fallback-${modelIndex + 1}-${entryIndex + 1}`),
          shiftName: String(entry.shift || entry.name || entry.shiftName || `Shift-${entryIndex + 1}`),
          start,
          end,
          lineId: null,
          stationId: null
        });
      }
    }
  }

  const dedup = [];
  const seen = new Set();
  for (const shift of shifts) {
    const key = `${shift.start}|${shift.end}|${String(shift.shiftName || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(shift);
  }

  return dedup;
}

function pickActiveOrFirstShift(shifts, nowMinutes) {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  return shifts.find((row) => shiftMatchesMinutes(row.start, row.end, nowMinutes)) || shifts[0];
}

function toShiftIdValue(rawId, shiftName) {
  const normalizedName = String(shiftName || '').trim();
  if (normalizedName) return normalizedName;
  const asNumber = Number(rawId);
  if (Number.isInteger(asNumber)) return asNumber;
  return String(rawId || '');
}

// Get station settings (bottleneck, cycleTime)
app.get('/api/stationSetting', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id,
          description,
          ISNULL(bottleneck, 0) AS bottleneck,
          ISNULL(is_last_station, 0) AS lastStation,
          cycle_time AS [cycleTime]
        FROM dbo.stations
        ORDER BY id ASC
      `
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Assign shift to station or line
app.post('/api/assign-shift', async (req, res) => {
  try {
    const { shiftId, targetType, targetId } = req.body;
    if (!shiftId || !targetType || !targetId) {
      return res.status(400).json({ error: 'shiftId, targetType, targetId required' });
    }
    await writePoint('shift_assignment', { shiftId, targetType, targetId });
    publishMasterdata('shift_assignment', { shiftId, targetType, targetId });
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List all shift assignments
app.get('/api/assign-shift', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, shift_id AS shiftId, target_type AS targetType, target_id AS targetId, line_id AS lineId, station_id AS stationId, created_at AS createdAt
        FROM dbo.shift_assignments
        ORDER BY id DESC
      `
    );
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update one shift assignment
app.patch('/api/assign-shift/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid assignment id is required.' });
    }

    const existing = await query(
      `SELECT id, shift_id AS shiftId, target_type AS targetType, target_id AS targetId, line_id AS lineId, station_id AS stationId FROM dbo.shift_assignments WHERE id = $1`,
      [id]
    );
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    const current = existing.rows[0];
    const shiftId = String(req.body?.shiftId ?? current.shiftId ?? '').trim() || null;
    const targetTypeRaw = String(req.body?.targetType ?? current.targetType ?? '').trim().toLowerCase();
    const targetType = targetTypeRaw === 'line' || targetTypeRaw === 'station' ? targetTypeRaw : null;
    const targetId = String(req.body?.targetId ?? current.targetId ?? '').trim() || null;
    const lineId = String(req.body?.lineId ?? current.lineId ?? '').trim() || (targetType === 'line' ? targetId : null);
    const stationId = String(req.body?.stationId ?? current.stationId ?? '').trim() || (targetType === 'station' ? targetId : null);

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId are required.' });
    }

    await query(
      `
        UPDATE dbo.shift_assignments
        SET shift_id = $1,
            target_type = $2,
            target_id = $3,
            line_id = $4,
            station_id = $5
        WHERE id = $6
      `,
      [shiftId, targetType, targetId, lineId || null, stationId || null, id]
    );

    const updated = await query(
      `SELECT id, shift_id AS shiftId, target_type AS targetType, target_id AS targetId, line_id AS lineId, station_id AS stationId FROM dbo.shift_assignments WHERE id = $1`,
      [id]
    );
    res.json({ status: 'ok', assignment: updated.rows?.[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete one shift assignment
app.delete('/api/assign-shift/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid assignment id is required.' });
    }

    const existing = await query(`SELECT id FROM dbo.shift_assignments WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found.' });
    }

    await query(`DELETE FROM dbo.shift_assignments WHERE id = $1`, [id]);
    res.json({ status: 'ok', deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Write station
app.post('/api/station', async (req, res) => {
  try {
    const { id, description, bottleneck, cycleTime, lastStation } = req.body;
    if (!id || !description) return res.status(400).json({ error: 'id and description required' });
    const parsedBottleneck = parseBoolean01(bottleneck, 'bottleneck');
    if (!parsedBottleneck.ok) return res.status(400).json({ error: parsedBottleneck.error });
    const parsedLastStation = parseBoolean01(lastStation, 'lastStation');
    if (!parsedLastStation.ok) return res.status(400).json({ error: parsedLastStation.error });
    let normalizedCycleTime = null;
    if (cycleTime !== '' && cycleTime != null) {
      normalizedCycleTime = Number(cycleTime);
      if (Number.isNaN(normalizedCycleTime)) {
        return res.status(400).json({ error: 'cycleTime must be a number or null' });
      }
    }

    const stationPayload = {
      id,
      description,
      bottleneck: parsedBottleneck.value,
      lastStation: parsedLastStation.value,
      cycleTime: normalizedCycleTime
    };

    await writePoint('station', stationPayload);
    publishMasterdata('station', stationPayload);
    res.json({ status: 'ok' });
  } catch (e) {
    appLogger.error('station.create.failed', { requestId: req.requestId, error: e, route: '/api/station' });
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.patch('/api/station/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'station id required' });

    const existing = await query(`SELECT id, description, ISNULL(bottleneck, 0) AS bottleneck, ISNULL(is_last_station, 0) AS lastStation, cycle_time AS cycleTime FROM dbo.stations WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    const current = existing.rows[0];
    const nextDescription = req.body?.description != null ? String(req.body.description).trim() : String(current.description || '');
    let nextBottleneck = current.bottleneck === true || current.bottleneck === 1;
    if (req.body?.bottleneck != null) {
      const parsed = parseBoolean01(req.body.bottleneck, 'bottleneck');
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      nextBottleneck = parsed.value;
    }
    let nextLastStation = current.lastStation === true || current.lastStation === 1;
    if (req.body?.lastStation != null) {
      const parsed = parseBoolean01(req.body.lastStation, 'lastStation');
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      nextLastStation = parsed.value;
    }

    let nextCycleTime = current.cycleTime;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'cycleTime')) {
      if (req.body.cycleTime === '' || req.body.cycleTime == null) {
        nextCycleTime = null;
      } else {
        const parsed = Number(req.body.cycleTime);
        if (Number.isNaN(parsed)) return res.status(400).json({ error: 'cycleTime must be a number or null' });
        nextCycleTime = parsed;
      }
    }

    await query(
      `UPDATE dbo.stations SET description = $1, bottleneck = $2, is_last_station = $3, cycle_time = $4, updated_at = SYSUTCDATETIME() WHERE id = $5`,
      [nextDescription, nextBottleneck, nextLastStation, nextCycleTime, id]
    );

    const updated = await query(`SELECT id, description, ISNULL(bottleneck, 0) AS bottleneck, ISNULL(is_last_station, 0) AS lastStation, cycle_time AS cycleTime FROM dbo.stations WHERE id = $1`, [id]);
    res.json({ status: 'ok', station: updated.rows?.[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/station/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'station id required' });

    const existing = await query(`SELECT id FROM dbo.stations WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    await query(`UPDATE dbo.shifts SET station_id = NULL, updated_at = SYSUTCDATETIME() WHERE station_id = $1`, [id]);
    await query(`DELETE FROM dbo.shift_assignments WHERE station_id = $1 OR (target_type = 'station' AND target_id = $1)`, [id]);
    await query(`DELETE FROM dbo.stations WHERE id = $1`, [id]);
    res.json({ status: 'ok', deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Write line
app.post('/api/line', async (req, res) => {
  try {
    const { id, description, shapeType } = req.body;
    if (!id || !description) return res.status(400).json({ error: 'id and description required' });
    const normalizedShapeType = normalizeLineShapeType(shapeType);
    await writePoint('line', { id, description, shapeType: normalizedShapeType });
    publishMasterdata('line', { id, description, shapeType: normalizedShapeType });
    res.json({ status: 'ok' });
  } catch (e) {
    appLogger.error('line.create.failed', { requestId: req.requestId, error: e, route: '/api/line' });
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.patch('/api/line/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const description = String(req.body?.description || '').trim();
    const shapeType = normalizeLineShapeType(req.body?.shapeType);
    if (!id) return res.status(400).json({ error: 'line id required' });
    if (!description) return res.status(400).json({ error: 'description required' });

    const existing = await query(`SELECT id FROM dbo.lines WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Line not found' });
    }

    await query(`UPDATE dbo.lines SET description = $1, shape_type = $2, updated_at = SYSUTCDATETIME() WHERE id = $3`, [description, shapeType, id]);
    const updated = await query(`SELECT id, description, shape_type AS shapeType FROM dbo.lines WHERE id = $1`, [id]);
    res.json({ status: 'ok', line: updated.rows?.[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/line/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'line id required' });

    const existing = await query(`SELECT id FROM dbo.lines WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Line not found' });
    }

    await query(`UPDATE dbo.shifts SET line_id = NULL, updated_at = SYSUTCDATETIME() WHERE line_id = $1`, [id]);
    await query(`DELETE FROM dbo.shift_assignments WHERE line_id = $1 OR (target_type = 'line' AND target_id = $1)`, [id]);
    await query(`DELETE FROM dbo.lines WHERE id = $1`, [id]);
    res.json({ status: 'ok', deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Write shift
app.post('/api/shift', async (req, res) => {
  try {
    const { id, name, start, end, lineId, stationId } = req.body;
    if (!id || !name || !start || !end) return res.status(400).json({ error: 'id, name, start, end required' });
    await writePoint('shift', { id, name, start, end, lineId, stationId });
    publishMasterdata('shift', { id, name, start, end, lineId, stationId });
    res.json({ status: 'ok' });
  } catch (e) {
    appLogger.error('shift.create.failed', { requestId: req.requestId, error: e, route: '/api/shift' });
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.patch('/api/shift/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'shift id required' });

    const existing = await query(
      `SELECT id, name, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId FROM dbo.shifts WHERE id = $1`,
      [id]
    );
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    const current = existing.rows[0];
    const name = req.body?.name != null ? String(req.body.name).trim() : String(current.name || '');
    const start = req.body?.start != null ? String(req.body.start).trim() : String(current.start || '');
    const end = req.body?.end != null ? String(req.body.end).trim() : String(current.end || '');
    const lineId = req.body?.lineId != null ? String(req.body.lineId || '').trim() || null : (current.lineId || null);
    const stationId = req.body?.stationId != null ? String(req.body.stationId || '').trim() || null : (current.stationId || null);

    if (!name || !start || !end) return res.status(400).json({ error: 'name, start, end required' });

    await query(
      `UPDATE dbo.shifts SET name = $1, start_time = $2, end_time = $3, line_id = $4, station_id = $5, updated_at = SYSUTCDATETIME() WHERE id = $6`,
      [name, start, end, lineId, stationId, id]
    );

    const updated = await query(
      `SELECT id, name, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId FROM dbo.shifts WHERE id = $1`,
      [id]
    );
    res.json({ status: 'ok', shift: updated.rows?.[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/shift/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'shift id required' });

    const existing = await query(`SELECT id FROM dbo.shifts WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Shift not found' });
    }

    await query(`DELETE FROM dbo.shift_assignments WHERE shift_id = $1`, [id]);
    await query(`DELETE FROM dbo.shifts WHERE id = $1`, [id]);
    res.json({ status: 'ok', deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Read stations
app.get('/api/stations', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id,
          description,
          ISNULL(bottleneck, 0) AS bottleneck,
          ISNULL(is_last_station, 0) AS lastStation,
          cycle_time AS [cycleTime]
        FROM dbo.stations
        ORDER BY id ASC
      `
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Read lines
app.get('/api/lines', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, description, shape_type AS shapeType
        FROM dbo.lines
        ORDER BY id ASC
      `
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Read shifts
app.get('/api/shifts', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT
          id,
          name,
          start_time AS start,
          end_time AS [end],
          line_id AS [lineId],
          station_id AS [stationId]
        FROM dbo.shifts
        ORDER BY id ASC
      `
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: stations assigned to one line
app.get('/api/lines/:lineId/stations', async (req, res) => {
  try {
    const lineId = String(req.params.lineId || '').trim();
    if (!lineId) return res.status(400).json({ error: 'lineId required' });

    const result = await query(
      `
        SELECT DISTINCT
          x.stationId AS id,
          x.stationDescription AS description,
          x.bottleneck,
          x.cycleTime
        FROM (
          SELECT
            s.id AS stationId,
            s.description AS stationDescription,
            ISNULL(s.bottleneck, 0) AS bottleneck,
            s.cycle_time AS cycleTime
          FROM dbo.shifts sh
          INNER JOIN dbo.stations s ON s.id = sh.station_id
          WHERE sh.line_id = $1

          UNION

          SELECT
            s.id AS stationId,
            s.description AS stationDescription,
            ISNULL(s.bottleneck, 0) AS bottleneck,
            s.cycle_time AS cycleTime
          FROM dbo.shift_assignments sa
          LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
          INNER JOIN dbo.stations s ON s.id = COALESCE(sa.station_id, sh.station_id)
          WHERE COALESCE(sa.line_id, sh.line_id) = $1
        ) x
        ORDER BY x.stationId ASC
      `,
      [lineId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: all time events from measurements storage (if available)
app.get('/api/time-events', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT measurement, fields
        FROM dbo.measurements
        WHERE measurement IN ('time_event', 'time-events', 'timeEvents')
        ORDER BY id DESC
      `
    );

    const events = [];
    for (const row of result.rows) {
      let parsed = null;
      try {
        parsed = JSON.parse(row.fields || '{}');
      } catch (_) {
        parsed = null;
      }
      if (!parsed) continue;

      if (Array.isArray(parsed)) {
        for (const ev of parsed) {
          if (ev && ev.id) {
            events.push({
              id: String(ev.id),
              description: String(ev.description || ''),
              productive: ev.productive === 1 || ev.productive === true ? 1 : 0
            });
          }
        }
      } else if (parsed.id) {
        events.push({
          id: String(parsed.id),
          description: String(parsed.description || ''),
          productive: parsed.productive === 1 || parsed.productive === true ? 1 : 0
        });
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const ev of events) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      dedup.push(ev);
    }
    res.json(dedup);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: all shift modells from measurements storage (if available)
app.get('/api/shift-modells', async (req, res) => {
  try {
    const result = await query(
      `
        SELECT measurement, fields
        FROM dbo.measurements
        WHERE measurement IN ('shift_modell', 'shift-modells', 'weekPlans', 'weekPlanSets')
        ORDER BY id DESC
      `
    );

    const modells = [];
    for (const row of result.rows) {
      let parsed = null;
      try {
        parsed = JSON.parse(row.fields || '{}');
      } catch (_) {
        parsed = null;
      }
      if (!parsed) continue;

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.name && Array.isArray(item.entries)) {
            modells.push({ name: String(item.name), entries: item.entries });
          }
        }
      } else if (parsed.name && Array.isArray(parsed.entries)) {
        modells.push({ name: String(parsed.name), entries: parsed.entries });
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const model of modells) {
      if (seen.has(model.name)) continue;
      seen.add(model.name);
      dedup.push(model);
    }
    res.json(dedup);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: bottleneck stations for a line
app.get('/api/lines/:lineId/bottlenecks', async (req, res) => {
  try {
    const lineId = String(req.params.lineId || '').trim();
    if (!lineId) return res.status(400).json({ error: 'lineId required' });

    const result = await query(
      `
        SELECT DISTINCT
          x.lineId,
          s.id AS stationId,
          s.id,
          s.description AS stationDescription,
          s.description,
          s.cycle_time AS [cycleTime]
        FROM (
          SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
          FROM dbo.shift_assignments sa
          LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
          WHERE COALESCE(sa.line_id, sh.line_id) = $1

          UNION

          SELECT sh.line_id AS lineId, sh.station_id AS stationId
          FROM dbo.shifts sh
          WHERE sh.line_id = $1
        ) x
        INNER JOIN dbo.stations s ON s.id = x.stationId
        WHERE x.lineId = $1
          AND ISNULL(s.bottleneck, 0) = 1
        ORDER BY s.id ASC
      `,
      [lineId]
    );
    res.json(result.rows.map((row) => ({
      lineId: String(row.lineId || lineId),
      stationId: row.stationId,
      stationDescription: row.stationDescription,
      cycleTime: row.cycleTime != null ? Number(row.cycleTime) : null,
      id: row.id,
      description: row.description
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: bottleneck cycle time target for a line
app.get('/api/lines/:lineId/bottleneck-cycle-time', async (req, res) => {
  try {
    const lineId = String(req.params.lineId || '').trim();
    if (!lineId) return res.status(400).json({ error: 'lineId required' });

    const result = await query(
      `
        SELECT TOP 1
          s.id AS bottleneckStationId,
          s.description AS bottleneckStationDescription,
          s.cycle_time AS bottleneckCycleTime
        FROM (
          SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
          FROM dbo.shift_assignments sa
          LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
          WHERE COALESCE(sa.line_id, sh.line_id) = $1

          UNION

          SELECT sh.line_id AS lineId, sh.station_id AS stationId
          FROM dbo.shifts sh
          WHERE sh.line_id = $1
        ) x
        INNER JOIN dbo.stations s ON s.id = x.stationId
        WHERE x.lineId = $1
          AND ISNULL(s.bottleneck, 0) = 1
          AND s.cycle_time IS NOT NULL
        ORDER BY s.cycle_time ASC, s.id ASC
      `,
      [lineId]
    );

    const row = result.rows?.[0] || null;
    const value = row?.bottleneckCycleTime;
    res.json({
      lineId,
      bottleneckCycleTime: value != null ? Number(value) : null,
      bottleneckStationId: row?.bottleneckStationId || null,
      bottleneckStationDescription: row?.bottleneckStationDescription || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: cycle time for one station
app.get('/api/stations/:stationId/cycle-time', async (req, res) => {
  try {
    const stationId = String(req.params.stationId || '').trim();
    if (!stationId) return res.status(400).json({ error: 'stationId required' });

    const result = await query(
      `
        SELECT id AS stationId, cycle_time AS cycleTime
        FROM dbo.stations
        WHERE id = $1
      `,
      [stationId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: shift schedule by stationId or lineId
app.get('/api/shift-schedule', async (req, res) => {
  try {
    const stationId = String(req.query.stationId || '').trim();
    const lineId = String(req.query.lineId || '').trim();
    const timezone = String(req.query.timezone || '-1').trim() || '-1';
    if (!stationId && !lineId) {
      return res.status(400).json({ error: 'stationId or lineId required' });
    }

    const now = getNowInTimeZone(timezone);
    const nowMinutes = (now.hour * 60) + now.minute;

    let sqlText = `
      SELECT id AS shiftId, name, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
      FROM dbo.shifts
      WHERE 1 = 1
    `;
    const params = [];
    if (stationId) {
      params.push(stationId);
      sqlText += ` AND station_id = $${params.length}`;
    }
    if (lineId) {
      params.push(lineId);
      sqlText += ` AND line_id = $${params.length}`;
    }
    sqlText += ` ORDER BY id ASC`;

    const result = await query(sqlText, params);
    const payload = result.rows.map((row) => {
      const mins = computeDurationMinutes(row.start, row.end);
      return {
        ...row,
        shiftStart: row.start,
        shiftEnd: row.end,
        duration: mins != null ? `${mins} min` : null,
        productive: 1,
        isActive: shiftMatchesMinutes(row.start, row.end, nowMinutes)
      };
    });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contract API: shift data using server local time
app.get('/api/shift-data', async (req, res) => {
  try {
    const lineId = String(req.query.lineId || '').trim();

    if (lineId) {
      const now = getNowInTimeZone();
      const nowMinutes = (now.hour * 60) + now.minute;
      const result = await query(
        `
          SELECT id AS shiftId, name AS shiftName, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
          FROM dbo.shifts
          WHERE line_id = $1
          ORDER BY id ASC
        `,
        [lineId]
      );

      const shifts = (result.rows || []).map((row) => {
        const mins = computeDurationMinutes(row.start, row.end);
        return {
          shiftId: row.shiftId,
          shiftName: row.shiftName,
          shiftStart: row.start,
          shiftEnd: row.end,
          duration: mins != null ? `${mins} min` : null,
          productive: 1,
          lineId: row.lineId,
          stationId: row.stationId || null,
          isActive: shiftMatchesMinutes(row.start, row.end, nowMinutes)
        };
      });

      const active = shifts.find((s) => s.isActive) || null;

      return res.json({
        lineId,
        shiftCount: shifts.length,
        activeShiftId: active?.shiftId || null,
        activeShiftName: active?.shiftName || null,
        shifts
      });
    }

    const now = getNowInTimeZone();
    const nowMinutes = (now.hour * 60) + now.minute;

    const result = await query(
      `
        SELECT id AS shiftId, name AS shiftName, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
        FROM dbo.shifts
        ORDER BY id ASC
      `
    );

    const active = result.rows.find((row) => shiftMatchesMinutes(row.start, row.end, nowMinutes));
    if (!active) {
      return res.json({
        shiftId: null,
        shiftName: null,
        shiftStartDate: null,
        shiftEndDate: null,
        duration: null,
        productive: 0
      });
    }

    const dt = buildShiftDateTimes(active, now);
    const mins = computeDurationMinutes(active.start, active.end);
    res.json({
      shiftId: active.shiftId,
      shiftName: active.shiftName,
      shiftStart: active.start,
      shiftEnd: active.end,
      shiftStartDate: dt.shiftStartDate,
      shiftEndDate: dt.shiftEndDate,
      duration: mins != null ? `${mins} min` : null,
      productive: 1,
      lineId: active.lineId || null,
      stationId: active.stationId || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// UNS output: shift schedule envelope
app.get('/api/uns/shift-schedule', async (req, res) => {
  try {
    const stationId = String(req.query.stationId || '').trim();
    const lineId = String(req.query.lineId || '').trim();
    const timezone = String(req.query.timezone || '-1').trim() || '-1';

    if (!stationId && !lineId) {
      return res.status(400).json({ error: 'stationId or lineId required' });
    }

    const now = getNowInTimeZone(timezone);
    const nowMinutes = (now.hour * 60) + now.minute;
    const shifts = await loadShiftsForTarget({ stationId, lineId });
    const active = pickActiveOrFirstShift(shifts, nowMinutes);
    if (!active) {
      return res.status(404).json({ error: 'No shift found for target' });
    }

    const dt = buildShiftDateTimes(active, now);
    const lengthMinutes = computeDurationMinutes(active.start, active.end);

    return res.json({
      Version: UNS_API_VERSION,
      Timestamp: new Date().toISOString(),
      ShiftSchedule: {
        StartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
        EndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
        Length: lengthMinutes != null ? lengthMinutes : 0,
        ShiftID: toShiftIdValue(active.shiftId, active.shiftName),
        ShiftDesc: String(active.shiftName || '')
      }
    });
  } catch (e) {
    if (String(e.message || '').includes('Invalid time zone')) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    res.status(500).json({ error: e.message });
  }
});

// UNS output: break schedule envelope
app.get('/api/uns/break-schedule', async (req, res) => {
  try {
    const shiftId = String(req.query.shiftId || '').trim();
    const stationId = String(req.query.stationId || '').trim();
    const lineId = String(req.query.lineId || '').trim();
    const timezone = String(req.query.timezone || '-1').trim() || '-1';

    let targetShift = null;
    const now = getNowInTimeZone(timezone);
    const nowMinutes = (now.hour * 60) + now.minute;

    if (shiftId) {
      const result = await query(
        `
          SELECT id AS shiftId, name AS shiftName, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
          FROM dbo.shifts
          WHERE id = $1
        `,
        [shiftId]
      );
      targetShift = result.rows?.[0] || null;
    } else if (stationId || lineId) {
      const shifts = await loadShiftsForTarget({ stationId, lineId });
      targetShift = pickActiveOrFirstShift(shifts, nowMinutes);
    }

    const targetShiftName = String(targetShift?.shiftName || '').trim().toLowerCase();

    const source = await query(
      `
        SELECT fields
        FROM dbo.measurements
        WHERE measurement IN ('shift_modell', 'shift-modells', 'weekPlans', 'weekPlanSets')
        ORDER BY id DESC
      `
    );

    const breaks = [];
    for (const row of source.rows || []) {
      let parsed = null;
      try {
        parsed = JSON.parse(row.fields || '{}');
      } catch (_) {
        parsed = null;
      }
      if (!parsed) continue;

      const models = Array.isArray(parsed) ? parsed : [parsed];
      for (const model of models) {
        const entries = Array.isArray(model?.entries) ? model.entries : [];
        entries.forEach((entry, idx) => {
          const productive = parseFlexibleBoolean(entry?.productive);
          if (productive) return;

          const entryShiftName = String(entry?.shift || entry?.name || '').trim().toLowerCase();
          if (targetShiftName && entryShiftName && entryShiftName !== targetShiftName) {
            return;
          }

          const startText = String(entry?.start || entry?.breakStartTime || '').trim();
          const endText = String(entry?.end || entry?.breakEndTime || '').trim();
          if (!startText || !endText) return;

          const breakShift = { start: startText, end: endText };
          const dt = buildShiftDateTimes(breakShift, now);
          const lengthMinutes = computeDurationMinutes(startText, endText);

          breaks.push({
            BreakStartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
            BreakEndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
            Length: String(lengthMinutes != null ? lengthMinutes : (entry?.duration || '')),
            BreakID: String(entry?.breakId || entry?.id || (idx + 1)),
            BreakDesc: String(entry?.breakDesc || entry?.timeevent || entry?.description || `Break-${idx + 1}`)
          });
        });
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const item of breaks) {
      const key = `${item.BreakStartTime}|${item.BreakEndTime}|${item.BreakDesc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(item);
    }

    return res.json({
      Version: UNS_API_VERSION,
      Timestamp: new Date().toISOString(),
      BreakSchedule: dedup
    });
  } catch (e) {
    if (String(e.message || '').includes('Invalid time zone')) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    res.status(500).json({ error: e.message });
  }
});

// UNS output: cycle time envelope
app.get('/api/uns/cycle-time', async (req, res) => {
  try {
    const stationId = String(req.query.stationId || '').trim();
    const lineId = String(req.query.lineId || '').trim();

    if (!stationId && !lineId) {
      return res.status(400).json({ error: 'stationId or lineId required' });
    }

    let cycleValue = null;

    if (stationId) {
      const result = await query(
        `
          SELECT cycle_time AS cycleTime
          FROM dbo.stations
          WHERE id = $1
        `,
        [stationId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Station not found' });
      }
      cycleValue = result.rows[0]?.cycleTime;
    } else {
      const result = await query(
        `
          SELECT TOP 1 s.cycle_time AS cycleTime
          FROM (
            SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
            FROM dbo.shift_assignments sa
            LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
            WHERE COALESCE(sa.line_id, sh.line_id) = $1

            UNION

            SELECT sh.line_id AS lineId, sh.station_id AS stationId
            FROM dbo.shifts sh
            WHERE sh.line_id = $1
          ) x
          INNER JOIN dbo.stations s ON s.id = x.stationId
          WHERE x.lineId = $1
            AND s.cycle_time IS NOT NULL
          ORDER BY ISNULL(s.bottleneck, 0) DESC, s.cycle_time ASC, s.id ASC
        `,
        [lineId]
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'No cycle time found for line' });
      }
      cycleValue = result.rows[0]?.cycleTime;
    }

    return res.json({
      Version: UNS_API_VERSION,
      Timestamp: new Date().toISOString(),
      CycleTime: {
        Value: cycleValue != null ? String(Number(cycleValue)) : ''
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// MES summary for one line (minimal input: lineId)
app.get('/api/lines/:lineId/mes-summary', async (req, res) => {
  try {
    const lineId = String(req.params.lineId || '').trim();
    const timezone = String(req.query.timezone || '-1').trim() || '-1';
    if (!lineId) return res.status(400).json({ error: 'lineId required' });

    const now = getNowInTimeZone(timezone);
    const nowMinutes = (now.hour * 60) + now.minute;

    const lineResult = await query(
      `SELECT id AS lineId, description FROM dbo.lines WHERE id = $1`,
      [lineId]
    );
    if (!lineResult.rows.length) {
      return res.status(404).json({ error: 'Line not found' });
    }

    const stationsResult = await query(
      `
        SELECT DISTINCT s.id, s.description, ISNULL(s.bottleneck, 0) AS bottleneck, s.cycle_time AS cycleTime
        FROM dbo.shifts sh
        INNER JOIN dbo.stations s ON s.id = sh.station_id
        WHERE sh.line_id = $1
      `,
      [lineId]
    );

    const shiftsResult = await query(
      `
        SELECT id AS shiftId, name AS shiftName, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
        FROM dbo.shifts
        WHERE line_id = $1
        ORDER BY id ASC
      `,
      [lineId]
    );

    const shiftRows = shiftsResult.rows || [];
    const active = shiftRows.find((row) => shiftMatchesMinutes(row.start, row.end, nowMinutes)) || null;

    const bottleneckResult = await query(
      `
        SELECT TOP 1 s.id AS stationId, s.description AS stationDescription, s.cycle_time AS cycleTime
        FROM dbo.shifts sh
        INNER JOIN dbo.stations s ON s.id = sh.station_id
        WHERE sh.line_id = $1
          AND ISNULL(s.bottleneck, 0) = 1
          AND s.cycle_time IS NOT NULL
        ORDER BY s.cycle_time ASC, s.id ASC
      `,
      [lineId]
    );

    const bottleneck = bottleneckResult.rows?.[0] || null;
    const bottleneckCycleTime = bottleneck?.cycleTime != null ? Number(bottleneck.cycleTime) : null;

    return res.json({
      lineId,
      lineDescription: lineResult.rows[0].description,
      timezone,
      stationCount: stationsResult.rows.length,
      shiftCount: shiftRows.length,
      activeShiftId: active?.shiftId || null,
      activeShiftName: active?.shiftName || null,
      bottleneckStationId: bottleneck?.stationId || null,
      bottleneckStationDescription: bottleneck?.stationDescription || null,
      bottleneckCycleTime
    });
  } catch (e) {
    if (String(e.message || '').includes('Invalid time zone')) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
    res.status(500).json({ error: e.message });
  }
});

// Validate relational integrity across SQL-linked tables
app.get('/api/sql-integrity', async (req, res) => {
  try {
    const report = await getRelationalIntegrityReport();
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Repair relational integrity issues and return before/after report
app.post('/api/sql-integrity-repair', async (req, res) => {
  try {
    const report = await repairRelationalIntegrity();
    res.json({ status: 'ok', report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mqtt-explorer/status', async (req, res) => {
  try {
    res.json(getExplorerStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/connect', async (req, res) => {
  try {
    const status = await connectExplorer(req.body || {});
    res.json({ status: 'ok', mqtt: status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/disconnect', async (req, res) => {
  try {
    await disconnectExplorer();
    res.json({ status: 'ok', mqtt: getExplorerStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/subscribe', async (req, res) => {
  try {
    const topic = String(req.body?.topic || '').trim();
    const qos = Number(req.body?.qos || 0);
    const status = await subscribeTopic(topic, qos);
    res.json({ status: 'ok', mqtt: status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/unsubscribe', async (req, res) => {
  try {
    const topic = String(req.body?.topic || '').trim();
    const status = await unsubscribeTopic(topic);
    res.json({ status: 'ok', mqtt: status });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/publish', async (req, res) => {
  try {
    await publishMessage({
      topic: req.body?.topic,
      payload: req.body?.payload,
      qos: req.body?.qos,
      retain: req.body?.retain
    });
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/mqtt-explorer/messages', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 200);
    const clear = String(req.query.clear || 'false').toLowerCase() === 'true';
    res.json({
      status: 'ok',
      messages: getExplorerMessages({ limit, clear })
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mqtt-explorer/messages/clear', async (req, res) => {
  try {
    clearExplorerMessages();
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API endpoint to receive JSON and write to Microsoft SQL Server
app.post('/api/point', async (req, res) => {
  try {
    const { measurement, fields, tags } = req.body;
    if (!measurement || !fields) {
      return res.status(400).json({ error: 'measurement and fields are required' });
    }
    await writePoint(measurement, fields, tags || {});
    res.json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeTemplateAssignments(rawAssignments) {
  const source = Array.isArray(rawAssignments) ? rawAssignments : [];
  const dedup = new Map();

  source.forEach((item) => {
    const lineId = String(item?.lineId || '').trim();
    const stationId = String(item?.stationId || '').trim();
    if (!lineId || !stationId) return;
    dedup.set(`${lineId}|${stationId}`, { lineId, stationId });
  });

  return Array.from(dedup.values());
}

async function syncTemplateAssignmentsToLive(rawAssignments) {
  const assignments = normalizeTemplateAssignments(rawAssignments);
  const lines = [...new Set(assignments.map((item) => item.lineId))];

  for (const lineId of lines) {
    // Replace only line-station helper rows for this line to avoid stale metadata mappings.
    await query(
      `
        DELETE FROM dbo.shift_assignments
        WHERE shift_id IS NULL
          AND target_type = 'station'
          AND line_id = $1
      `,
      [lineId]
    );
  }

  for (const item of assignments) {
    await writePoint('shift_assignment', {
      lineId: item.lineId,
      stationId: item.stationId
    });
  }

  return {
    enabled: true,
    replacedLines: lines.length,
    upsertedAssignments: assignments.length
  };
}

// Save or update a full master data template for a plant.
app.post('/api/masterdata-template', async (req, res) => {
  try {
    const plant = String(req.body?.plant || '').trim();
    const templateName = String(req.body?.templateName || '').trim();
    const payload = req.body?.payload;
    const syncLiveAssignments = req.body?.syncLiveAssignments !== false;

    if (!plant || !templateName || !payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'plant, templateName and payload object are required.' });
    }

    const payloadText = JSON.stringify(payload);
    const actor = String(req.auth?.user || '').trim() || null;

    await query(
      `
        UPDATE dbo.masterdata_templates
        SET payload = $1,
            created_by = $2,
            updated_at = SYSUTCDATETIME()
        WHERE plant = $3 AND template_name = $4
      `,
      [payloadText, actor, plant, templateName]
    );

    const check = await query(
      `SELECT id FROM dbo.masterdata_templates WHERE plant = $1 AND template_name = $2`,
      [plant, templateName]
    );

    if (!check.rows || check.rows.length === 0) {
      await query(
        `
          INSERT INTO dbo.masterdata_templates (plant, template_name, payload, created_by)
          VALUES ($1, $2, $3, $4)
        `,
        [plant, templateName, payloadText, actor]
      );
    }

    const saved = await query(
      `
        SELECT TOP 1
          id,
          plant,
          template_name AS templateName,
          created_by AS createdBy,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM dbo.masterdata_templates
        WHERE plant = $1 AND template_name = $2
      `,
      [plant, templateName]
    );

    let liveAssignmentSync = {
      enabled: false,
      replacedLines: 0,
      upsertedAssignments: 0
    };

    if (syncLiveAssignments) {
      liveAssignmentSync = await syncTemplateAssignmentsToLive(payload?.assignments);
    }

    res.json({
      status: 'ok',
      template: saved.rows?.[0] || null,
      liveAssignmentSync
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List available master data templates by plant.
app.get('/api/masterdata-templates', async (req, res) => {
  try {
    const plant = String(req.query.plant || '').trim();
    const params = [];
    let sqlText = `
      SELECT
        id,
        plant,
        template_name AS templateName,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM dbo.masterdata_templates
    `;

    if (plant) {
      params.push(plant);
      sqlText += ` WHERE plant = $1`;
    }

    sqlText += ` ORDER BY updated_at DESC, template_name ASC`;

    const result = await query(sqlText, params);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Load one template payload by id.
app.get('/api/masterdata-templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid template id is required.' });
    }

    const result = await query(
      `
        SELECT
          id,
          plant,
          template_name AS templateName,
          payload,
          created_by AS createdBy,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM dbo.masterdata_templates
        WHERE id = $1
      `,
      [id]
    );

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const row = result.rows[0];
    let payload = {};
    try {
      payload = JSON.parse(row.payload || '{}');
    } catch (_) {
      payload = {};
    }

    res.json({
      id: row.id,
      plant: row.plant,
      templateName: row.templateName,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      payload
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rename plant for a selected template entry.
app.patch('/api/masterdata-templates/:id/plant', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const newPlant = String(req.body?.plant || '').trim();
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid template id is required.' });
    }
    if (!newPlant) {
      return res.status(400).json({ error: 'New plant name is required.' });
    }

    const existing = await query(
      `
        SELECT id, plant, template_name AS templateName
        FROM dbo.masterdata_templates
        WHERE id = $1
      `,
      [id]
    );

    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const current = existing.rows[0];
    const nameConflict = await query(
      `
        SELECT id
        FROM dbo.masterdata_templates
        WHERE plant = $1 AND template_name = $2 AND id <> $3
      `,
      [newPlant, current.templateName, id]
    );
    if (nameConflict.rows && nameConflict.rows.length > 0) {
      return res.status(409).json({
        error: `A template named '${current.templateName}' already exists for plant '${newPlant}'.`
      });
    }

    await query(
      `
        UPDATE dbo.masterdata_templates
        SET plant = $1,
            updated_at = SYSUTCDATETIME()
        WHERE id = $2
      `,
      [newPlant, id]
    );

    const updated = await query(
      `
        SELECT
          id,
          plant,
          template_name AS templateName,
          created_by AS createdBy,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM dbo.masterdata_templates
        WHERE id = $1
      `,
      [id]
    );

    res.json({ status: 'ok', template: updated.rows?.[0] || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/masterdata-templates/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid template id is required.' });
    }

    const existing = await query(`SELECT id FROM dbo.masterdata_templates WHERE id = $1`, [id]);
    if (!existing.rows || existing.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    await query(`DELETE FROM dbo.masterdata_templates WHERE id = $1`, [id]);
    res.json({ status: 'ok', deletedId: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api/contract', async (req, res, next) => {
  if (String(req.method || '').toUpperCase() !== 'GET') {
    return next();
  }

  const contractPath = String(req.path || '').trim();

  if (contractPath === '/uns-shift-schedule' || contractPath === '/shift-schedule-v1') {
    try {
      const stationId = String(req.query.stationId || '').trim();
      const lineId = String(req.query.lineId || '').trim();
      const timezone = String(req.query.timezone || '-1').trim() || '-1';

      if (!stationId && !lineId) {
        return res.status(400).json({ error: 'stationId or lineId required' });
      }

      const now = getNowInTimeZone(timezone);
      const nowMinutes = (now.hour * 60) + now.minute;
      const shifts = await loadShiftsForTarget({ stationId, lineId });
      const active = pickActiveOrFirstShift(shifts, nowMinutes);
      if (!active) {
        return res.status(404).json({ error: 'No shift found for target' });
      }

      const dt = buildShiftDateTimes(active, now);
      const lengthMinutes = computeDurationMinutes(active.start, active.end);

      return res.json({
        Version: UNS_API_VERSION,
        Timestamp: new Date().toISOString(),
        ShiftSchedule: {
          StartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
          EndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
          Length: lengthMinutes != null ? lengthMinutes : 0,
          ShiftID: toShiftIdValue(active.shiftId, active.shiftName),
          ShiftDesc: String(active.shiftName || '')
        }
      });
    } catch (e) {
      if (String(e.message || '').includes('Invalid time zone')) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
      return res.status(500).json({ error: e.message });
    }
  }

  if (contractPath === '/uns-break-schedule' || contractPath === '/break-schedule-v1') {
    try {
      const shiftId = String(req.query.shiftId || '').trim();
      const stationId = String(req.query.stationId || '').trim();
      const lineId = String(req.query.lineId || '').trim();
      const timezone = String(req.query.timezone || '-1').trim() || '-1';

      let targetShift = null;
      const now = getNowInTimeZone(timezone);
      const nowMinutes = (now.hour * 60) + now.minute;

      if (shiftId) {
        const result = await query(
          `
            SELECT id AS shiftId, name AS shiftName, start_time AS start, end_time AS [end], line_id AS lineId, station_id AS stationId
            FROM dbo.shifts
            WHERE id = $1
          `,
          [shiftId]
        );
        targetShift = result.rows?.[0] || null;
      } else if (stationId || lineId) {
        const shifts = await loadShiftsForTarget({ stationId, lineId });
        targetShift = pickActiveOrFirstShift(shifts, nowMinutes);
      }

      const targetShiftName = String(targetShift?.shiftName || '').trim().toLowerCase();

      const source = await query(
        `
          SELECT fields
          FROM dbo.measurements
          WHERE measurement IN ('shift_modell', 'shift-modells', 'weekPlans', 'weekPlanSets')
          ORDER BY id DESC
        `
      );

      const breaks = [];
      for (const row of source.rows || []) {
        let parsed = null;
        try {
          parsed = JSON.parse(row.fields || '{}');
        } catch (_) {
          parsed = null;
        }
        if (!parsed) continue;

        const models = Array.isArray(parsed) ? parsed : [parsed];
        for (const model of models) {
          const entries = Array.isArray(model?.entries) ? model.entries : [];
          entries.forEach((entry, idx) => {
            const productive = parseFlexibleBoolean(entry?.productive);
            if (productive) return;

            const entryShiftName = String(entry?.shift || entry?.name || '').trim().toLowerCase();
            if (targetShiftName && entryShiftName && entryShiftName !== targetShiftName) {
              return;
            }

            const startText = String(entry?.start || entry?.breakStartTime || '').trim();
            const endText = String(entry?.end || entry?.breakEndTime || '').trim();
            if (!startText || !endText) return;

            const breakShift = { start: startText, end: endText };
            const dt = buildShiftDateTimes(breakShift, now);
            const lengthMinutes = computeDurationMinutes(startText, endText);

            breaks.push({
              BreakStartTime: toIsoUtc(dt.shiftStartDate) || dt.shiftStartDate,
              BreakEndTime: toIsoUtc(dt.shiftEndDate) || dt.shiftEndDate,
              Length: String(lengthMinutes != null ? lengthMinutes : (entry?.duration || '')),
              BreakID: String(entry?.breakId || entry?.id || (idx + 1)),
              BreakDesc: String(entry?.breakDesc || entry?.timeevent || entry?.description || `Break-${idx + 1}`)
            });
          });
        }
      }

      const dedup = [];
      const seen = new Set();
      for (const item of breaks) {
        const key = `${item.BreakStartTime}|${item.BreakEndTime}|${item.BreakDesc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(item);
      }

      return res.json({
        Version: UNS_API_VERSION,
        Timestamp: new Date().toISOString(),
        BreakSchedule: dedup
      });
    } catch (e) {
      if (String(e.message || '').includes('Invalid time zone')) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
      return res.status(500).json({ error: e.message });
    }
  }

  if (contractPath === '/uns-cycle-time' || contractPath === '/cycle-time-v1') {
    try {
      const stationId = String(req.query.stationId || '').trim();
      const lineId = String(req.query.lineId || '').trim();

      if (!stationId && !lineId) {
        return res.status(400).json({ error: 'stationId or lineId required' });
      }

      let cycleValue = null;

      if (stationId) {
        const result = await query(
          `
            SELECT cycle_time AS cycleTime
            FROM dbo.stations
            WHERE id = $1
          `,
          [stationId]
        );
        if (!result.rows.length) {
          return res.status(404).json({ error: 'Station not found' });
        }
        cycleValue = result.rows[0]?.cycleTime;
      } else {
        const result = await query(
          `
            SELECT TOP 1 s.cycle_time AS cycleTime
            FROM (
              SELECT COALESCE(sa.line_id, sh.line_id) AS lineId, COALESCE(sa.station_id, sh.station_id) AS stationId
              FROM dbo.shift_assignments sa
              LEFT JOIN dbo.shifts sh ON sh.id = sa.shift_id
              WHERE COALESCE(sa.line_id, sh.line_id) = $1

              UNION

              SELECT sh.line_id AS lineId, sh.station_id AS stationId
              FROM dbo.shifts sh
              WHERE sh.line_id = $1
            ) x
            INNER JOIN dbo.stations s ON s.id = x.stationId
            WHERE x.lineId = $1
              AND s.cycle_time IS NOT NULL
            ORDER BY ISNULL(s.bottleneck, 0) DESC, s.cycle_time ASC, s.id ASC
          `,
          [lineId]
        );
        if (!result.rows.length) {
          return res.status(404).json({ error: 'No cycle time found for line' });
        }
        cycleValue = result.rows[0]?.cycleTime;
      }

      return res.json({
        Version: UNS_API_VERSION,
        Timestamp: new Date().toISOString(),
        CycleTime: {
          Value: cycleValue != null ? String(Number(cycleValue)) : ''
        }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return next();
});

async function startServer() {
  try {
    await initDb();
    await loadLocalUsersFromDb();
    await ensureDefaultLocalUsers();

    const integrity = await repairRelationalIntegrity();
    if (integrity.repairedStationsWithoutLine > 0) {
      appLogger.warn('sql.integrity.auto_repair.applied', {
        repairedRows: integrity.repairedStationsWithoutLine
      });
    }
    appLogger.info('sql.integrity.status', { report: integrity.after });

    app.listen(PORT, () => {
      appLogger.info('server.started', {
        port: PORT,
        url: `http://localhost:${PORT}`,
        dbMode: 'connected'
      });
    });
  } catch (e) {
    appLogger.error('db.initialization.failed', { error: e });
    appLogger.warn('server.degraded_mode.enabled', {
      reason: 'DB-dependent endpoints may fail.'
    });
    if (!localUsers.has(SERVICE_USER)) {
      upsertLocalUser({
        username: SERVICE_USER,
        password: SERVICE_PASSWORD,
        role: 'admin',
        permissions: ALL_PERMISSIONS,
        source: 'degraded-service-default'
      });
    }
    if (!localUsers.has(ADMIN_USER)) {
      upsertLocalUser({
        username: ADMIN_USER,
        password: ADMIN_PASSWORD,
        role: 'admin',
        permissions: ALL_PERMISSIONS,
        source: 'degraded-admin-default'
      });
    }
    if (!localUsers.has(REPORT_USER)) {
      upsertLocalUser({
        username: REPORT_USER,
        password: REPORT_PASSWORD,
        role: 'user',
        permissions: ['masterdata.read', 'system.health', 'api.catalog.test'],
        source: 'degraded-report-default'
      });
    }
    app.listen(PORT, () => {
      appLogger.warn('server.started.degraded', {
        port: PORT,
        url: `http://localhost:${PORT}`,
        dbMode: 'disconnected'
      });
    });
  }
}

process.on('unhandledRejection', (reason) => {
  appLogger.error('process.unhandled_rejection', { reason });
});

process.on('uncaughtException', (error) => {
  appLogger.fatal('process.uncaught_exception', { error });
});

startServer();