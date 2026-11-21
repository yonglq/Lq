export type UserLevel = 1 | 2 | 3;
export type UserRole = 'admin' | 'manager' | 'technician';

export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export interface PasswordValidationResult {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isValid: boolean;
}

export function evaluatePasswordRules(
  password: string
): PasswordValidationResult {
  const minLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  return {
    minLength,
    hasLetter,
    hasNumber,
    hasSymbol,
    isValid: PASSWORD_REGEX.test(password),
  };
}

export interface AuthUser {
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

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface SendOtpResponse {
  message: string;
  expiresAt?: string;
  previewCode?: string;
}

export function formatUserLevel(level: UserLevel): string {
  switch (level) {
    case 1:
      return 'Level 1 — Admin';
    case 2:
      return 'Level 2 — Manager';
    case 3:
      return 'Level 3 — Technician';
  }
}

export function formatUserRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Manager';
    case 'technician':
      return 'Technician';
  }
}

export function getUserLevelBadgeStyle(level: UserLevel): string {
  switch (level) {
    case 1:
      return 'bg-slate-900 text-white';
    case 2:
      return 'bg-blue-100 text-blue-800';
    case 3:
      return 'bg-slate-100 text-slate-700';
  }
}
