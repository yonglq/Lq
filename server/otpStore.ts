import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateNumericOtp, hashOtp, verifyOtpHash } from './authCrypto.ts';

export type OtpPurpose = 'signup' | 'reset';

export interface OtpRecord {
  id: string;
  email: string;
  purpose: OtpPurpose;
  otp_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  created_at: string;
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;

const DATA_DIR = path.resolve(process.cwd(), '.data');
const OTPS_FILE = path.join(DATA_DIR, 'otps.json');

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function readOtpsFromDisk(): OtpRecord[] {
  try {
    if (!fs.existsSync(OTPS_FILE)) return [];
    const raw = fs.readFileSync(OTPS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as OtpRecord[]) : [];
  } catch {
    return [];
  }
}

function writeOtpsToDisk(records: OtpRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tempPath = `${OTPS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(records, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tempPath, OTPS_FILE);
}

let otpsCache: OtpRecord[] = readOtpsFromDisk();

function pruneExpired(): void {
  const now = Date.now();
  const next = otpsCache.filter(
    (rec) => new Date(rec.expires_at).getTime() > now
  );
  if (next.length !== otpsCache.length) {
    otpsCache = next;
    writeOtpsToDisk(otpsCache);
  }
}

export const otpStore = {
  issue(
    email: string,
    purpose: OtpPurpose
  ): { plainCode: string; expiresAt: string } {
    pruneExpired();
    const normalized = normalizeEmail(email);
    const plainCode = generateNumericOtp();
    const now = Date.now();
    const expiresAt = new Date(now + OTP_TTL_MS).toISOString();

    const record: OtpRecord = {
      id: crypto.randomUUID(),
      email: normalized,
      purpose,
      otp_hash: hashOtp(plainCode),
      attempts: 0,
      max_attempts: MAX_OTP_ATTEMPTS,
      expires_at: expiresAt,
      created_at: new Date(now).toISOString(),
    };

    otpsCache = [
      ...otpsCache.filter(
        (r) => !(r.email === normalized && r.purpose === purpose)
      ),
      record,
    ];
    writeOtpsToDisk(otpsCache);

    return { plainCode, expiresAt };
  },

  verifyAndConsume(
    email: string,
    purpose: OtpPurpose,
    candidateCode: string
  ): { ok: true } | { ok: false; error: string } {
    pruneExpired();
    const normalized = normalizeEmail(email);
    const trimmedCode = candidateCode.trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      return {
        ok: false,
        error: 'Enter the 6-digit verification code sent to your email.',
      };
    }

    const index = otpsCache.findIndex(
      (r) => r.email === normalized && r.purpose === purpose
    );
    if (index === -1) {
      return {
        ok: false,
        error:
          'No active verification code found. Request a new 6-digit code.',
      };
    }

    const record = otpsCache[index];
    if (new Date(record.expires_at).getTime() <= Date.now()) {
      otpsCache = otpsCache.filter((r) => r.id !== record.id);
      writeOtpsToDisk(otpsCache);
      return {
        ok: false,
        error: 'Verification code has expired. Request a new code.',
      };
    }

    if (record.attempts >= record.max_attempts) {
      otpsCache = otpsCache.filter((r) => r.id !== record.id);
      writeOtpsToDisk(otpsCache);
      return {
        ok: false,
        error:
          'Maximum verification attempts reached. Request a new 6-digit code.',
      };
    }

    const matched = verifyOtpHash(trimmedCode, record.otp_hash);
    if (!matched) {
      const nextAttempts = record.attempts + 1;
      if (nextAttempts >= record.max_attempts) {
        otpsCache = otpsCache.filter((r) => r.id !== record.id);
        writeOtpsToDisk(otpsCache);
        return {
          ok: false,
          error:
            'Too many incorrect attempts (5/5). Request a new verification code.',
        };
      }

      otpsCache = otpsCache.map((r) =>
        r.id === record.id ? { ...r, attempts: nextAttempts } : r
      );
      writeOtpsToDisk(otpsCache);
      const remaining = record.max_attempts - nextAttempts;
      return {
        ok: false,
        error: `Invalid verification code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`,
      };
    }

    // Delete OTP record immediately upon successful verification
    otpsCache = otpsCache.filter((r) => r.id !== record.id);
    writeOtpsToDisk(otpsCache);
    return { ok: true };
  },
};
