import {
  AuthSession,
  AuthUser,
  SendOtpResponse,
  UserLevel,
} from '../types/auth';

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
  getConfig(): Promise<{
    testResetEnabled: boolean;
    repeatSignupOverwrite: boolean;
  }> {
    return apiRequest<{
      testResetEnabled: boolean;
      repeatSignupOverwrite: boolean;
    }>('/api/auth/config');
  },

  resetTestAccount(email: string): Promise<{
    reset: boolean;
    email: string;
    removedUser: boolean;
    clearedOtps: number;
    message: string;
  }> {
    return apiRequest<{
      reset: boolean;
      email: string;
      removedUser: boolean;
      clearedOtps: number;
      message: string;
    }>(`/api/auth/test-reset?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
  },

  sendOtp(params: {
    email: string;
    purpose: 'signup' | 'reset';
  }): Promise<SendOtpResponse> {
    return apiRequest<SendOtpResponse>('/api/auth/send-otp', {
      method: 'POST',
      body: params,
    });
  },

  signup(params: {
    full_name: string;
    email: string;
    otp: string;
    password: string;
  }): Promise<AuthSession> {
    return apiRequest<AuthSession>('/api/auth/signup', {
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
    otp: string;
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

  updateUser(
    token: string,
    userId: string,
    patch: { level?: UserLevel; is_active?: boolean; full_name?: string }
  ): Promise<{ user: AuthUser }> {
    return apiRequest<{ user: AuthUser }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        token,
        body: patch,
      }
    );
  },

  deleteUser(token: string, userId: string): Promise<{ deletedId: string }> {
    return apiRequest<{ deletedId: string }>(
      `/api/users/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        token,
      }
    );
  },
};
