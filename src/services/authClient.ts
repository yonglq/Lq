import { AuthSession, AuthStatus, AuthUser, UserRole } from '../types/auth';

async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    token?: string | null;
    body?: Record<string, unknown>;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

export const authClient = {
  getStatus(): Promise<AuthStatus> {
    return apiRequest<AuthStatus>('/api/auth/status');
  },

  setupInitialAdmin(params: {
    full_name: string;
    email: string;
    password: string;
    bootstrapPasscode?: string;
  }): Promise<AuthSession> {
    return apiRequest<AuthSession>('/api/auth/setup', {
      method: 'POST',
      body: params,
    });
  },

  registerTechnician(params: {
    full_name: string;
    email: string;
    password: string;
  }): Promise<AuthSession> {
    return apiRequest<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: params,
    });
  },

  login(params: { email: string; password: string }): Promise<AuthSession> {
    return apiRequest<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: params,
    });
  },

  resetPassword(params: {
    email: string;
    token: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    return apiRequest<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: params,
    });
  },

  listUsers(token: string): Promise<{ users: AuthUser[] }> {
    return apiRequest<{ users: AuthUser[] }>('/api/users', { token });
  },

  createUser(
    token: string,
    params: {
      full_name: string;
      email: string;
      role: UserRole;
      password: string;
    }
  ): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>('/api/users', {
      method: 'POST',
      token,
      body: params,
    });
  },

  updateUser(
    token: string,
    userId: string,
    patch: { full_name?: string; role?: UserRole; is_active?: boolean }
  ): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      token,
      body: patch,
    });
  },

  issueResetToken(
    token: string,
    userId: string
  ): Promise<{ user: AuthUser; resetToken: string; expiresAt: string }> {
    return apiRequest<{
      user: AuthUser;
      resetToken: string;
      expiresAt: string;
    }>(`/api/users/${encodeURIComponent(userId)}/reset-token`, {
      method: 'POST',
      token,
    });
  },
};
