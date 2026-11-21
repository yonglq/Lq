import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { UserLevel, UserRole } from './authCrypto.ts';
import { isValidLevel, levelFromRole, roleFromLevel } from './authCrypto.ts';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  level: UserLevel;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string;
  level: UserLevel;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

export function toPublicUser(record: UserRecord): PublicUser {
  return {
    id: record.id,
    email: record.email,
    full_name: record.full_name,
    level: record.level,
    role: record.role,
    is_active: record.is_active,
    email_verified: record.email_verified,
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

function hydrateRecord(raw: Partial<UserRecord>): UserRecord | null {
  if (
    typeof raw.id !== 'string' ||
    typeof raw.email !== 'string' ||
    typeof raw.password_hash !== 'string' ||
    typeof raw.full_name !== 'string'
  ) {
    return null;
  }

  const level: UserLevel = isValidLevel(raw.level)
    ? raw.level
    : raw.role === 'admin' || raw.role === 'manager' || raw.role === 'technician'
      ? levelFromRole(raw.role)
      : 3;

  return {
    id: raw.id,
    email: normalizeEmail(raw.email),
    password_hash: raw.password_hash,
    full_name: raw.full_name,
    level,
    role: roleFromLevel(level),
    is_active: raw.is_active !== false,
    email_verified: raw.email_verified !== false,
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
  };
}

function readUsersFromDisk(): UserRecord[] {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => hydrateRecord(entry as Partial<UserRecord>))
      .filter((u): u is UserRecord => u !== null);
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
    return usersCache.some((u) => u.level === 1);
  },

  hasAnyOtherAdmin(excludeId: string): boolean {
    return usersCache.some((u) => u.level === 1 && u.id !== excludeId);
  },

  countActiveAdmins(): number {
    return usersCache.filter((u) => u.level === 1 && u.is_active).length;
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
    level: UserLevel;
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
    if (!isValidLevel(params.level)) {
      throw new Error('User level must be 1, 2, or 3.');
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
      level: params.level,
      role: roleFromLevel(params.level),
      is_active: params.is_active ?? true,
      email_verified: true,
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
      level?: UserLevel;
      is_active?: boolean;
      password_hash?: string;
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
    if (patch.level !== undefined && !isValidLevel(patch.level)) {
      throw new Error('User level must be 1, 2, or 3.');
    }

    const nextLevel: UserLevel = patch.level ?? current.level;
    const updated: UserRecord = {
      ...current,
      full_name: nextFullName,
      level: nextLevel,
      role: roleFromLevel(nextLevel),
      is_active: patch.is_active ?? current.is_active,
      password_hash: patch.password_hash ?? current.password_hash,
      updated_at: new Date().toISOString(),
    };

    usersCache = usersCache.map((u) => (u.id === id ? updated : u));
    writeUsersToDisk(usersCache);
    return updated;
  },

  remove(id: string): boolean {
    const exists = usersCache.some((u) => u.id === id);
    if (!exists) return false;
    usersCache = usersCache.filter((u) => u.id !== id);
    writeUsersToDisk(usersCache);
    return true;
  },

  removeByEmail(email: string): boolean {
    const normalized = normalizeEmail(email);
    const exists = usersCache.some((u) => u.email === normalized);
    if (!exists) return false;
    usersCache = usersCache.filter((u) => u.email !== normalized);
    writeUsersToDisk(usersCache);
    return true;
  },
};
