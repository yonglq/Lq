export type UserRole = 'admin' | 'manager' | 'technician';

export interface AuthUser {
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

export interface AuthStatus {
  needsAdminSetup: boolean;
  bootstrapPasscodeConfigured: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export function getUserRoleBadgeStyle(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-slate-900 text-white';
    case 'manager':
      return 'bg-blue-100 text-blue-800';
    case 'technician':
      return 'bg-slate-100 text-slate-700';
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
