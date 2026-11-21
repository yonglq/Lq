import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Send,
  Truck,
  User,
} from 'lucide-react';
import { authClient } from '../services/authClient';
import { AuthSession, evaluatePasswordRules } from '../types/auth';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
}

type AuthMode = 'login' | 'signup' | 'forgot';

function PasswordChecklist({ password }: { password: string }) {
  const rules = useMemo(() => evaluatePasswordRules(password), [password]);

  const items = [
    { key: 'minLength', label: 'At least 8 characters', met: rules.minLength },
    {
      key: 'hasLetter',
      label: 'Contains a letter (A–Z or a–z)',
      met: rules.hasLetter,
    },
    { key: 'hasNumber', label: 'Contains a number (0–9)', met: rules.hasNumber },
    {
      key: 'hasSymbol',
      label: 'Contains a symbol (!@#$%^&*)',
      met: rules.hasSymbol,
    },
  ];

  return (
    <div
      className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5"
      aria-live="polite"
    >
      <p className="text-xs font-semibold text-slate-700">
        Password Requirements
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-2 text-xs ${
              item.met ? 'text-emerald-700 font-medium' : 'text-slate-500'
            }`}
          >
            {item.met ? (
              <Check
                className="w-3.5 h-3.5 text-emerald-600 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Circle
                className="w-3.5 h-3.5 text-slate-300 shrink-0"
                aria-hidden="true"
              />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [previewOtpCode, setPreviewOtpCode] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passwordRules = useMemo(
    () => evaluatePasswordRules(password),
    [password]
  );

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setSuccessMsg(null);
    setOtpNotice(null);
    setPreviewOtpCode(null);
    setOtp('');
    setPassword('');
    setShowPassword(false);
  };

  const handleSendOtp = async () => {
    setError(null);
    setSuccessMsg(null);
    setOtpNotice(null);
    setPreviewOtpCode(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address before requesting a code.');
      return;
    }

    setSendingOtp(true);
    try {
      const res = await authClient.sendOtp({
        email: trimmedEmail,
        purpose: mode === 'signup' ? 'signup' : 'reset',
      });
      setOtpNotice(res.message);
      if (res.previewCode) {
        setPreviewOtpCode(res.previewCode);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send verification code.'
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email address is required.');
      return;
    }

    if (mode === 'signup' || mode === 'forgot') {
      if (!/^\d{6}$/.test(otp.trim())) {
        setError('Enter the 6-digit verification code sent to your email.');
        return;
      }
      if (!passwordRules.isValid) {
        setError(
          'Password must be at least 8 characters and include a letter, number, and symbol.'
        );
        return;
      }
    }

    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        const session = await authClient.login({
          email: trimmedEmail,
          password,
        });
        onAuthenticated(session);
      } else if (mode === 'signup') {
        const session = await authClient.signup({
          full_name: fullName.trim(),
          email: trimmedEmail,
          otp: otp.trim(),
          password,
        });
        onAuthenticated(session);
      } else if (mode === 'forgot') {
        const res = await authClient.resetPassword({
          email: trimmedEmail,
          otp: otp.trim(),
          newPassword: password,
        });
        switchMode('login');
        setEmail(trimmedEmail);
        setSuccessMsg(res.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Request failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center mx-auto">
            <Truck className="w-6 h-6" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
            VanSpare Sync
          </h1>
          <p className="text-sm text-slate-600">
            {mode === 'login'
              ? 'Sign in to access your van inventory and claim controls.'
              : mode === 'signup'
                ? 'Verify your email to register a new account.'
                : 'Verify your email with a 6-digit code to set a new password.'}
          </p>
        </div>

        {/* Unified Auth Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              {mode === 'login'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Sign Up as New User'
                  : 'Forgot Password'}
            </h2>
          </div>

          {successMsg && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-3 text-xs text-emerald-900"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {otpNotice && (
            <div
              role="status"
              className="rounded-lg bg-blue-50 border border-blue-200 px-3.5 py-3 text-xs text-blue-900 space-y-1.5"
            >
              <p className="leading-relaxed">{otpNotice}</p>
              {previewOtpCode && (
                <p className="font-mono font-semibold text-blue-950">
                  Preview Verification Code:{' '}
                  <span className="tracking-widest text-sm">
                    {previewOtpCode}
                  </span>
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Full Name (Sign Up only) */}
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <div className="relative">
                  <User
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="auth-fullname"
                    type="text"
                    required
                    maxLength={150}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Enter your full name"
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
            )}

            {/* Email + Send Verification Code button (for Sign Up & Forgot Password) */}
            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                Email Address
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    maxLength={255}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="name@company.com"
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>

                {(mode === 'signup' || mode === 'forgot') && (
                  <button
                    type="button"
                    disabled={sendingOtp}
                    onClick={handleSendOtp}
                    className="min-h-[48px] px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-900 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {sendingOtp ? 'Sending...' : 'Send Verification Code'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* 6-Digit Email Verification Code (Sign Up & Forgot Password) */}
            {(mode === 'signup' || mode === 'forgot') && (
              <div>
                <label
                  htmlFor="auth-otp"
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                >
                  6-Digit Email Verification Code
                </label>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  />
                  <input
                    id="auth-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(digits);
                      if (error) setError(null);
                    }}
                    placeholder="000000"
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-[0.25em] text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                  />
                </div>
              </div>
            )}

            {/* Password / New Password with Show/Hide Eye Toggle */}
            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-semibold text-slate-700 mb-1.5"
              >
                {mode === 'forgot' ? 'New Password' : 'Password'}
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={
                    mode === 'login'
                      ? 'Enter your password'
                      : '8+ chars with letter, number & symbol'
                  }
                  className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-12 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Live Visual Password Checklist (Sign Up & Forgot Password) */}
            {(mode === 'signup' || mode === 'forgot') && (
              <PasswordChecklist password={password} />
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-sm text-rose-800"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white font-semibold text-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              {submitting
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign In'
                  : mode === 'signup'
                    ? 'Verify & Create Account'
                    : 'Verify & Reset Password'}
            </button>
          </form>

          {/* Navigation Links between Login / Sign Up / Forgot Password */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            {mode === 'login' ? (
              <>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="min-h-[40px] px-1 font-semibold text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Sign up as new user
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="min-h-[40px] px-1 font-semibold text-slate-600 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Forgot password
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="min-h-[40px] px-1 font-semibold text-blue-700 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
