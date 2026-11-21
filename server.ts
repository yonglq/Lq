import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import {
  PASSWORD_POLICY_MESSAGE,
  hashPassword,
  isStrongPassword,
  isValidLevel,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './server/authCrypto.ts';
import type { UserLevel } from './server/authCrypto.ts';
import { sendVerificationCodeEmail } from './server/emailService.ts';
import { otpStore } from './server/otpStore.ts';
import type { OtpPurpose } from './server/otpStore.ts';
import {
  isValidEmail,
  normalizeEmail,
  toPublicUser,
  userStore,
} from './server/userStore.ts';
import type { UserRecord } from './server/userStore.ts';

interface AuthenticatedRequest extends Request {
  authUser?: UserRecord;
}

const PORT = Number(process.env.PORT) || 3000;

function getFirstAdminEmail(): string {
  return process.env.FIRST_ADMIN_EMAIL?.trim().toLowerCase() ?? '';
}

function isRepeatSignupOverwriteEnabled(): boolean {
  return process.env.ALLOW_REPEAT_SIGNUP_TEST === 'true';
}

function isTestResetEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' || isRepeatSignupOverwriteEnabled()
  );
}

function resolveSignupLevel(
  normalizedEmail: string,
  excludeUserId?: string
): UserLevel {
  const hasAdmin = excludeUserId
    ? userStore.hasAnyOtherAdmin(excludeUserId)
    : userStore.hasAnyAdmin();

  if (hasAdmin) {
    return 3;
  }

  const firstAdminEmail = getFirstAdminEmail();
  if (firstAdminEmail.length > 0) {
    return normalizedEmail === firstAdminEmail ? 1 : 3;
  }

  // When FIRST_ADMIN_EMAIL is not configured and no Admin exists yet, promote the first verified user to Level 1 Admin
  return 1;
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
    res
      .status(401)
      .json({ error: 'Session expired or invalid. Please sign in again.' });
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

function requireLevel(...allowedLevels: UserLevel[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.authUser || !allowedLevels.includes(req.authUser.level)) {
      res.status(403).json({
        error: 'Forbidden: Your user level does not have access to this resource.',
      });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Expose non-sensitive auth testing flags for UI controls
  app.get('/api/auth/config', (_req: Request, res: Response) => {
    res.json({
      testResetEnabled: isTestResetEnabled(),
      repeatSignupOverwrite: isRepeatSignupOverwriteEnabled(),
    });
  });

  // Dev / Test-only endpoint to reset a specific test email for repeated OTP + Sign Up testing
  app.delete('/api/auth/test-reset', (req: Request, res: Response) => {
    if (!isTestResetEnabled()) {
      res.status(403).json({
        error: 'Test account reset is disabled in production mode.',
      });
      return;
    }

    const rawEmail = req.query.email;
    if (typeof rawEmail !== 'string' || !isValidEmail(rawEmail)) {
      res.status(400).json({ error: 'Provide a valid email query parameter.' });
      return;
    }

    const normalized = normalizeEmail(rawEmail);
    const removedUser = userStore.removeByEmail(normalized);
    const clearedOtps = otpStore.clearForEmail(normalized);

    res.json({
      reset: true,
      email: normalized,
      removedUser,
      clearedOtps,
      message: removedUser
        ? `Cleared test account for ${normalized}. You can now re-test OTP & Sign Up from scratch.`
        : `Cleared any pending verification codes for ${normalized}. Ready for fresh Sign Up.`,
    });
  });

  // Send 6-digit email verification code for Sign Up or Forgot Password
  app.post('/api/auth/send-otp', async (req: Request, res: Response) => {
    try {
      const { email, purpose } = req.body ?? {};
      if (typeof email !== 'string' || !isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (purpose !== 'signup' && purpose !== 'reset') {
        res.status(400).json({ error: 'Invalid verification purpose.' });
        return;
      }

      const normalized = normalizeEmail(email);
      const existing = userStore.findByEmail(normalized);

      if (
        purpose === 'signup' &&
        existing &&
        !isRepeatSignupOverwriteEnabled()
      ) {
        res.status(409).json({
          error: isTestResetEnabled()
            ? 'An account with this email already exists. Sign in or click "Reset this email for re-testing".'
            : 'An account with this email already exists. Please sign in.',
        });
        return;
      }

      if (purpose === 'reset') {
        // Avoid enumerating accounts when SMTP is configured in production
        if (!existing || !existing.is_active) {
          res.json({
            message:
              'If an active account exists for this email, a 6-digit verification code has been sent.',
          });
          return;
        }
      }

      const { plainCode, expiresAt } = otpStore.issue(
        normalized,
        purpose as OtpPurpose
      );

      const delivery = await sendVerificationCodeEmail({
        to: normalized,
        code: plainCode,
        purpose: purpose as OtpPurpose,
      });

      res.json({
        message:
          delivery.deliveredVia === 'smtp'
            ? 'A 6-digit verification code has been sent to your email. It expires in 10 minutes.'
            : 'Verification code generated (expires in 10 minutes). Configure SMTP_* secrets for live email delivery.',
        expiresAt,
        ...(delivery.previewCode ? { previewCode: delivery.previewCode } : {}),
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to send verification code right now.',
      });
    }
  });

  // Complete Sign Up with verified 6-digit OTP and strict password validation
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { full_name, email, otp, password } = req.body ?? {};

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

      if (typeof email !== 'string' || !isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (typeof password !== 'string' || !isStrongPassword(password)) {
        res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
        return;
      }

      if (typeof otp !== 'string') {
        res.status(400).json({
          error: 'Enter the 6-digit email verification code.',
        });
        return;
      }

      const normalized = normalizeEmail(email);
      const existing = userStore.findByEmail(normalized);
      const allowOverwrite = isRepeatSignupOverwriteEnabled();

      if (existing && !allowOverwrite) {
        res.status(409).json({
          error: isTestResetEnabled()
            ? 'An account with this email already exists. Sign in or click "Reset this email for re-testing".'
            : 'An account with this email already exists. Please sign in.',
        });
        return;
      }

      const otpCheck = otpStore.verifyAndConsume(normalized, 'signup', otp);
      if (!otpCheck.ok) {
        res.status(400).json({ error: otpCheck.error });
        return;
      }

      const assignedLevel = resolveSignupLevel(normalized, existing?.id);
      const passwordHash = await hashPassword(password);

      if (existing && allowOverwrite) {
        const updated = userStore.update(existing.id, {
          full_name: full_name.trim(),
          password_hash: passwordHash,
          level: assignedLevel,
          is_active: true,
        });
        const record = updated as UserRecord;
        const token = signSessionToken(record);
        res.status(200).json({ token, user: toPublicUser(record) });
        return;
      }

      const created = userStore.create({
        email: normalized,
        password_hash: passwordHash,
        full_name: full_name.trim(),
        level: assignedLevel,
        is_active: true,
      });

      const token = signSessionToken(created);
      res.status(201).json({ token, user: toPublicUser(created) });
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_EMAIL') {
        res
          .status(409)
          .json({ error: 'An account with this email already exists.' });
        return;
      }
      res.status(500).json({ error: 'Unable to complete sign up.' });
    }
  });

  // Email + Password Login
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

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
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

  // Complete Password Reset with verified 6-digit OTP and strict password validation
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { email, otp, newPassword } = req.body ?? {};

      if (typeof email !== 'string' || !isValidEmail(email)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }

      if (typeof newPassword !== 'string' || !isStrongPassword(newPassword)) {
        res.status(400).json({ error: PASSWORD_POLICY_MESSAGE });
        return;
      }

      if (typeof otp !== 'string') {
        res
          .status(400)
          .json({ error: 'Enter the 6-digit email verification code.' });
        return;
      }

      const normalized = normalizeEmail(email);
      const user = userStore.findByEmail(normalized);
      if (!user || !user.is_active) {
        res.status(400).json({
          error: 'Invalid or expired verification code.',
        });
        return;
      }

      const otpCheck = otpStore.verifyAndConsume(normalized, 'reset', otp);
      if (!otpCheck.ok) {
        res.status(400).json({ error: otpCheck.error });
        return;
      }

      const passwordHash = await hashPassword(newPassword);
      userStore.update(user.id, { password_hash: passwordHash });

      res.json({
        message: 'Password updated successfully. You can now sign in.',
      });
    } catch {
      res.status(500).json({ error: 'Unable to reset password.' });
    }
  });

  // Current Authenticated User Profile
  app.get(
    '/api/auth/me',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      res.json({ user: toPublicUser(req.authUser as UserRecord) });
    }
  );

  // =========================================================================
  // LEVEL 1 (ADMIN) EXCLUSIVE USER MANAGEMENT ROUTES
  // Level 2 (Manager) and Level 3 (Technician) receive 403 Forbidden.
  // =========================================================================

  app.get(
    '/api/users',
    requireAuth,
    requireLevel(1),
    (_req: AuthenticatedRequest, res: Response) => {
      res.json({ users: userStore.list().map(toPublicUser) });
    }
  );

  app.patch(
    '/api/users/:id',
    requireAuth,
    requireLevel(1),
    (req: AuthenticatedRequest, res: Response) => {
      const target = userStore.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const { level, is_active, full_name } = req.body ?? {};
      if (level !== undefined && !isValidLevel(level)) {
        res.status(400).json({
          error: 'User level must be 1 (Admin), 2 (Manager), or 3 (Technician).',
        });
        return;
      }
      if (is_active !== undefined && typeof is_active !== 'boolean') {
        res.status(400).json({ error: 'is_active must be a boolean.' });
        return;
      }

      const nextLevel: UserLevel = level ?? target.level;
      const nextActive: boolean = is_active ?? target.is_active;

      const removingAdminAccess =
        target.level === 1 &&
        target.is_active &&
        (nextLevel !== 1 || !nextActive);

      if (removingAdminAccess && userStore.countActiveAdmins() <= 1) {
        res.status(400).json({
          error: 'At least one active Level 1 Admin account must remain.',
        });
        return;
      }

      try {
        const updated = userStore.update(target.id, {
          full_name: typeof full_name === 'string' ? full_name : undefined,
          level: nextLevel,
          is_active: nextActive,
        });
        res.json({ user: toPublicUser(updated as UserRecord) });
      } catch (err) {
        res.status(400).json({
          error:
            err instanceof Error ? err.message : 'Unable to update user account.',
        });
      }
    }
  );

  app.delete(
    '/api/users/:id',
    requireAuth,
    requireLevel(1),
    (req: AuthenticatedRequest, res: Response) => {
      const target = userStore.findById(req.params.id);
      if (!target) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      if (req.authUser && target.id === req.authUser.id) {
        res.status(400).json({
          error: 'You cannot delete your own active Admin account.',
        });
        return;
      }

      if (
        target.level === 1 &&
        target.is_active &&
        userStore.countActiveAdmins() <= 1
      ) {
        res.status(400).json({
          error: 'Cannot delete the last active Level 1 Admin account.',
        });
        return;
      }

      userStore.remove(target.id);
      res.json({ deletedId: target.id });
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
