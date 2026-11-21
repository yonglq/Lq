import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

export type UserRole = 'admin' | 'manager' | 'technician';

export const VALID_ROLES: readonly UserRole[] = [
  'admin',
  'manager',
  'technician',
] as const;

export interface SessionPayload {
  sub: string;
  email: string;
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

export function timingSafeSecretEquals(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function generateResetToken(): {
  plainToken: string;
  tokenHash: string;
  expiresAt: string;
} {
  const plainToken = crypto.randomBytes(24).toString('base64url');
  const tokenHash = hashResetToken(plainToken);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return { plainToken, tokenHash, expiresAt };
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyResetToken(token: string, storedHash: string): boolean {
  const computed = Buffer.from(hashResetToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

export function signSessionToken(
  user: { id: string; email: string; role: UserRole },
  ttlMs = 8 * 60 * 60 * 1000
): string {
  const payload: SessionPayload = {
    sub: user.id,
    email: user.email,
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
      !VALID_ROLES.includes(parsed.role as UserRole) ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }

    if (parsed.exp <= Date.now()) {
      return null;
    }

    return parsed as SessionPayload;
  } catch {
    return null;
  }
}
