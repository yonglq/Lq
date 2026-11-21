import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

export type UserLevel = 1 | 2 | 3;
export type UserRole = 'admin' | 'manager' | 'technician';

export const VALID_LEVELS: readonly UserLevel[] = [1, 2, 3] as const;

// Minimum 8 chars, at least one letter, one number, and one symbol
export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include at least one letter, one number, and one symbol.';

export function isStrongPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}

export function isValidLevel(level: unknown): level is UserLevel {
  return level === 1 || level === 2 || level === 3;
}

export function roleFromLevel(level: UserLevel): UserRole {
  switch (level) {
    case 1:
      return 'admin';
    case 2:
      return 'manager';
    case 3:
      return 'technician';
  }
}

export function levelFromRole(role: UserRole): UserLevel {
  switch (role) {
    case 'admin':
      return 1;
    case 'manager':
      return 2;
    case 'technician':
      return 3;
  }
}

export interface SessionPayload {
  sub: string;
  email: string;
  level: UserLevel;
  role: UserRole;
  exp: number;
}

// Ephemeral in-memory fallback secret if AUTH_TOKEN_SECRET env var is unset
const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  const configured = process.env.AUTH_TOKEN_SECRET?.trim();
  return configured && configured.length >= 16
    ? configured
    : EPHEMERAL_FALLBACK_SECRET;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, keyHex] = parts;
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, 'hex');
  const derived = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateNumericOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

export function verifyOtpHash(code: string, storedHash: string): boolean {
  const computed = Buffer.from(hashOtp(code), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

export function signSessionToken(
  user: { id: string; email: string; level: UserLevel; role: UserRole },
  ttlMs = 8 * 60 * 60 * 1000
): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
    level: user.level,
    role: user.role,
    exp: Date.now() + ttlMs,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  );
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(encodedPayload)
    .digest();

  let actualSig: Buffer;
  try {
    actualSig = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }

  if (actualSig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<SessionPayload>;

    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string' ||
      !isValidLevel(parsed.level) ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    if (parsed.exp <= Date.now()) {
      return null;
    }

    return {
      sub: parsed.sub,
      email: parsed.email,
      level: parsed.level,
      role: roleFromLevel(parsed.level),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
