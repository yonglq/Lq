import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import {
  generateResetToken,
  hashPassword,
  signSessionToken,
  timingSafeSecretEquals,
  verifyPassword,
  verifyResetToken,
  verifySessionToken,
} from './server/authCrypto.ts';
import type { UserRole } from './server/authCrypto.ts';
import {
  isValidEmail,
  isValidRole,
  normalizeEmail,
  toPublicUser,
  userStore,
} from './server/userStore.ts';
import type { UserRecord } from './server/userStore.ts';

interface AuthenticatedRequest extends Request {
  authUser?: UserRecord;
}

const PORT = Number(process.env.PORT) || 3000;
const MIN_PASSWORD_LENGTH = 8;

function getConfiguredBootstrapPasscode(): string {
  return process.env.ADMIN_BOOTSTRAP_PASSCODE?.trim() ?? '';
}

function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Sign in again.' });
    return;
  }

  const user = userStore.findById(payload.sub);
  if (!user || !user.is_active) {
    res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    return;
  }

  req.authUser = user;
  next();
}

function requireRoles(...allowed: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.authUser || !allowed.includes(req.authUser.role)) {
      res
        .status(403)
        .json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Auth status (whether first-run Admin setup is open)
  app.get('/api/auth/status', (_req: Request, res: Response) => {
    const configuredPasscode = getConfiguredBootstrapPasscode();
    res.json({
      needsAdminSetup: !userStore.hasAnyAdmin(),
      bootstrapPasscodeConfigured: configuredPasscode.length > 0,
    });
  });

  // One-time initial Admin claim / setup
  app.post('/api/auth/setup', async (req: Request, res: Response) => {
    try {
      if (userStore.hasAnyAdmin()) {
        res.status(409).json({
          error: 'Initial admin account has already been configured. Please sign in.',
        });
        return;
      }

      const { email, password, full_name, bootstrapPasscode } = req.body ?? {};
      const configuredPasscode = getConfiguredBootstrapPasscode();
      if (configuredPasscode.length > 0) {
        if (
          typeof bootstrapPasscode !== 'string' ||
          !timingSafeSecretEquals(bootstrapPasscode.trim(), configuredPasscode)
        ) {
          res.status(403).json({
            error: 'Invalid admin bootstrap passcode.',
          });
          return;
        }
      }

      if (typeof email !== 'string' || !isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      if (
        typeof full_name !== 'string' ||
        full_name.trim().length < 2 ||
        full_name.trim().length > 150
      ) {
        res
          .status(400)
          .json({ error: 'Full name must be between 2 and 150 characters.' });
        return;
      }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
        return;
      }

      const passwordHash = await hashPassword(password);
      const created = userStore.create({
        email,
        password_hash: passwordHash,
        full_name,
        role: 'admin',
        is_active: true,
      });

      const token = signSessionToken(created);
      res.status(201).json({ token, user: toPublicUser(created) });
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to complete initial admin setup.' });
    }
  });

  // Public Technician self-registration (strictly enforces role = 'technician')
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, full_name } = req.body ?? {};

      if (typeof email !== 'string' || !isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      if (
        typeof full_name !== 'string' ||
        full_name.trim().length < 2 ||
        full_name.trim().length > 150
      ) {
        res
          .status(400)
          .json({ error: 'Full name must be between 2 and 150 characters.' });
        return;
      }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
        return;
      }

      const passwordHash = await hashPassword(password);
      const created = userStore.create({
        email,
        password_hash: passwordHash,
        full_name,
        role: 'technician',
        is_active: true,
      });

      const token = signSessionToken(created);
      res.status(201).json({ token, user: toPublicUser(created) });
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to create technician account.' });
    }
  });

  // Email + password login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const user = userStore.findByEmail(normalizeEmail(email));
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const configuredPasscode = getConfiguredBootstrapPasscode();
      const matchesPassword = await verifyPassword(password, user.password_hash);
      const matchesAdminOverride =
        user.role === 'admin' &&
        configuredPasscode.length > 0 &&
        timingSafeSecretEquals(password, configuredPasscode);

      if (!matchesPassword && !matchesAdminOverride) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({
          error: 'This account has been deactivated. Contact an administrator.',
        });
        return;
      }

      const token = signSessionToken(user);
      res.json({ token, user: toPublicUser(user) });
    } catch {
      res.status(500).json({ error: 'Sign-in failed. Please try again.' });
    }
  });

  // Current authenticated user profile
  app.get(
    '/api/auth/me',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      res.json({ user: toPublicUser(req.authUser as UserRecord) });
    }
  );

  // Unauthenticated forgot-password request (never leaks token or account existence)
  app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
    const { email } = req.body ?? {};
    if (typeof email === 'string' && isValidEmail(email)) {
      const user = userStore.findByEmail(email);
      if (user && user.is_active) {
        const { tokenHash, expiresAt } = generateResetToken();
        userStore.update(user.id, {
          reset_token_hash: tokenHash,
          reset_token_expires_at: expiresAt,
        });
      }
    }
    res.json({
      message:
        'If an active account matches that email, a reset request has been logged. Ask an Admin to issue your one-time reset token if email delivery is not configured.',
    });
  });

  // Complete password reset using one-time token verified against reset_token_hash
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { email, token, newPassword } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        !isValidEmail(email) ||
        typeof token !== 'string' ||
        !token.trim()
      ) {
        res.status(400).json({ error: 'Email and reset token are required.' });
        return;
      }
      if (
        typeof newPassword !== 'string' ||
        newPassword.length < MIN_PASSWORD_LENGTH
      ) {
        res.status(400).json({
          error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        });
        return;
      }

      const user = userStore.findByEmail(email);
      if (
        !user ||
        !user.is_active ||
        !user.reset_token_hash ||
        !user.reset_token_expires_at
      ) {
        res.status(400).json({ error: 'Invalid or expired reset token.' });
        return;
      }

      const expiresAtMs = new Date(user.reset_token_expires_at).getTime();
      if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        userStore.update(user.id, {
          reset_token_hash: null,
          reset_token_expires_at: null,
        });
        res.status(400).json({ error: 'Reset token has expired.' });
        return;
      }

      if (!verifyResetToken(token.trim(), user.reset_token_hash)) {
        res.status(400).json({ error: 'Invalid or expired reset token.' });
        return;
      }

      const passwordHash = await hashPassword(newPassword);
      userStore.update(user.id, {
        password_hash: passwordHash,
        reset_token_hash: null,
        reset_token_expires_at: null,
      });

      res.json({ message: 'Password updated. You can now sign in.' });
    } catch {
      res.status(500).json({ error: 'Unable to reset password.' });
    }
  });

  // List users (Admin & Manager read access)
  app.get(
    '/api/users',
    requireAuth,
    requireRoles('admin', 'manager'),
    (_req: AuthenticatedRequest, res: Response) => {
      res.json({ users: userStore.list().map(toPublicUser) });
    }
  );

  // Admin: create user with any valid role
  app.post(
    '/api/users',
    requireAuth,
    requireRoles('admin'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { email, password, full_name, role } = req.body ?? {};
        if (typeof email !== 'string' || !isValidEmail(email)) {
          res.status(400).json({ error: 'Enter a valid email address.' });
          return;
        }
        if (
          typeof full_name !== 'string' ||
          full_name.trim().length < 2 ||
          full_name.trim().length > 150
        ) {
          res
            .status(400)
            .json({ error: 'Full name must be between 2 and 150 characters.' });
          return;
        }
        if (!isValidRole(role)) {
          res.status(400).json({
            error: "Role must be 'admin', 'manager', or 'technician'.",
          });
          return;
        }
        if (
          typeof password !== 'string' ||
          password.length < MIN_PASSWORD_LENGTH
        ) {
          res.status(400).json({
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
          });
          return;
        }

        const passwordHash = await hashPassword(password);
        const created = userStore.create({
          email,
          password_hash: passwordHash,
          full_name,
          role,
          is_active: true,
        });

        res.status(201).json({ user: toPublicUser(created) });
      } catch (err) {
        if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
          res
            .status(409)
            .json({ error: 'An account with this email already exists.' });
          return;
        }
        res.status(500).json({ error: 'Unable to create user.' });
      }
    }
  );

  // Admin: update user role, name, or active status
  app.patch(
    '/api/users/:id',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res: Response) => {
      const target = userStore.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const { full_name, role, is_active } = req.body ?? {};
      if (role !== undefined && !isValidRole(role)) {
        res.status(400).json({
          error: "Role must be 'admin', 'manager', or 'technician'.",
        });
        return;
      }
      if (is_active !== undefined && typeof is_active !== 'boolean') {
        res.status(400).json({ error: 'is_active must be a boolean.' });
        return;
      }

      const nextRole: UserRole = role ?? target.role;
      const nextActive: boolean = is_active ?? target.is_active;

      const removingAdminPrivilege =
        target.role === 'admin' &&
        target.is_active &&
        (nextRole !== 'admin' || !nextActive);

      if (removingAdminPrivilege && userStore.countActiveAdmins() <= 1) {
        res.status(400).json({
          error: 'At least one active admin account is required.',
        });
        return;
      }

      try {
        const updated = userStore.update(target.id, {
          full_name: typeof full_name === 'string' ? full_name : undefined,
          role: nextRole,
          is_active: nextActive,
        });
        res.json({ user: toPublicUser(updated as UserRecord) });
      } catch (err) {
        res.status(400).json({
          error:
            err instanceof Error ? err.message : 'Unable to update user record.',
        });
      }
    }
  );

  // Admin: issue a one-time password reset token (stores only SHA-256 hash + 30m expiry)
  app.post(
    '/api/users/:id/reset-token',
    requireAuth,
    requireRoles('admin'),
    (req: AuthenticatedRequest, res: Response) => {
      const target = userStore.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const { plainToken, tokenHash, expiresAt } = generateResetToken();
      const updated = userStore.update(target.id, {
        reset_token_hash: tokenHash,
        reset_token_expires_at: expiresAt,
      });

      res.json({
        user: toPublicUser(updated as UserRecord),
        resetToken: plainToken,
        expiresAt,
      });
    }
  );

  // Mount Vite middleware in development or serve built static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VanSpare Sync server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
