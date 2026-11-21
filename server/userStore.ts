import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { UserRole } from './authCrypto.ts';
import { VALID_ROLES } from './authCrypto.ts';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  reset_token_hash: string | null;
  reset_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  has_pending_reset: boolean;
  reset_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export function toPublicUser(record: UserRecord): PublicUser {
  const hasPendingReset =
    Boolean(record.reset_token_hash) &&
    Boolean(record.reset_token_expires_at) &&
    new Date(record.reset_token_expires_at as string).getTime() > Date.now();

  return {
    id: record.id,
    email: record.email,
    full_name: record.full_name,
    role: record.role,
    is_active: record.is_active,
    has_pending_reset: hasPendingReset,
    reset_token_expires_at: hasPendingReset
      ? record.reset_token_expires_at
      : null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (normalized.length < 5 || normalized.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_ROLES.includes(role as UserRole);
}

function readUsersFromDisk(): UserRecord[] {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as UserRecord[];
  } catch {
    return [];
  }
}

function writeUsersToDisk(users: UserRecord[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const tempPath = `${USERS_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(users, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(tempPath, USERS_FILE);
}

let usersCache: UserRecord[] = readUsersFromDisk();

export const userStore = {
  list(): UserRecord[] {
    return [...usersCache].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  },

  hasAnyAdmin(): boolean {
    return usersCache.some((u) => u.role === 'admin');
  },

  countActiveAdmins(): number {
    return usersCache.filter((u) => u.role === 'admin' && u.is_active).length;
  },

  findById(id: string): UserRecord | undefined {
    return usersCache.find((u) => u.id === id);
  },

  findByEmail(email: string): UserRecord | undefined {
    const normalized = normalizeEmail(email);
    return usersCache.find((u) => u.email === normalized);
  },

  create(params: {
    email: string;
    password_hash: string;
    full_name: string;
    role: UserRole;
    is_active?: boolean;
  }): UserRecord {
    const email = normalizeEmail(params.email);
    const fullName = params.full_name.trim();

    if (!isValidEmail(email)) {
      throw new Error('Invalid email address.');
    }
    if (!fullName || fullName.length > 150) {
      throw new Error('Full name must be between 1 and 150 characters.');
    }
    if (!isValidRole(params.role)) {
      throw new Error('Invalid role.');
    }
    if (usersCache.some((u) => u.email === email)) {
      throw new Error('DUPLICATE_EMAIL');
    }

    const now = new Date().toISOString();
    const record: UserRecord = {
      id: crypto.randomUUID(),
      email,
      password_hash: params.password_hash,
      full_name: fullName,
      role: params.role,
      is_active: params.is_active ?? true,
      reset_token_hash: null,
      reset_token_expires_at: null,
      created_at: now,
      updated_at: now,
    };

    usersCache = [...usersCache, record];
    writeUsersToDisk(usersCache);
    return record;
  },

  update(
    id: string,
    patch: {
      full_name?: string;
      role?: UserRole;
      is_active?: boolean;
      password_hash?: string;
      reset_token_hash?: string | null;
      reset_token_expires_at?: string | null;
    }
  ): UserRecord | null {
    const idx = usersCache.findIndex((u) => u.id === id);
    if (idx === -1) return null;

    const current = usersCache[idx];
    const nextFullName =
      patch.full_name !== undefined ? patch.full_name.trim() : current.full_name;
    if (!nextFullName || nextFullName.length > 150) {
      throw new Error('Full name must be between 1 and 150 characters.');
    }
    if (patch.role !== undefined && !isValidRole(patch.role)) {
      throw new Error('Invalid role.');
    }

    const updated: UserRecord = {
      ...current,
      full_name: nextFullName,
      role: patch.role ?? current.role,
      is_active: patch.is_active ?? current.is_active,
      password_hash: patch.password_hash ?? current.password_hash,
      reset_token_hash:
        patch.reset_token_hash !== undefined
          ? patch.reset_token_hash
          : current.reset_token_hash,
      reset_token_expires_at:
        patch.reset_token_expires_at !== undefined
          ? patch.reset_token_expires_at
          : current.reset_token_expires_at,
      updated_at: new Date().toISOString(),
    };

    usersCache = usersCache.map((u) => (u.id === id ? updated : u));
    writeUsersToDisk(usersCache);
    return updated;
  },
};
