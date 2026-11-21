import React, { useEffect, useMemo, useState } from 'react';
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
  RotateCcw,
  Send,
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

  const [testResetEnabled, setTestResetEnabled] = useState<boolean>(false);
  const [resettingTestEmail, setResettingTestEmail] = useState<boolean>(false);

  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [previewOtpCode, setPreviewOtpCode] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authClient
      .getConfig()
      .then((cfg) => {
        if (active) {
          setTestResetEnabled(cfg.testResetEnabled);
        }
      })
      .catch(() => {
        // Default to false if config cannot be fetched
      });
    return () => {
      active = false;
    };
  }, []);

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

  const handleResetTestEmail = async () => {
    setError(null);
    setSuccessMsg(null);
    setOtpNotice(null);
    setPreviewOtpCode(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter the email address you want to reset for re-testing.');
      return;
    }

    setResettingTestEmail(true);
    try {
      const res = await authClient.resetTestAccount(trimmedEmail);
      setOtp('');
      setSuccessMsg(res.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to reset test account for this email.'
      );
    } finally {
      setResettingTestEmail(false);
    }
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
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Unified White Auth Card with MasBina Security Alarm Branding */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Dual-Tone Brand Accent Bar: Royal Blue (#1B499B) + Security Red (#E31E24) */}
          <div className="h-1.5 w-full flex" aria-hidden="true">
            <div className="w-3/4 bg-[#1B499B]" />
            <div className="w-1/4 bg-[#E31E24]" />
          </div>

          <div className="p-6 sm:p-7 space-y-5">
            {/* MasBina Security Alarm Logo & Subtitle */}
            <div className="text-center space-y-2 pb-4 border-b border-slate-100">
              <img
                src="/images/masbina-logo.png"
                alt="MasBina Security Alarm Since 1986"
                className="h-20 sm:h-24 w-auto mx-auto object-contain"
              />
              <div>
                <h1 className="font-display text-lg font-bold tracking-tight text-[#1B499B]">
                  {mode === 'login'
                    ? 'Sign In to Your Account'
                    : mode === 'signup'
                      ? 'Sign Up as New User'
                      : 'Reset Your Password'}
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  {mode === 'login'
                    ? 'Access MasBina Security Alarm field van inventory & claim controls.'
                    : mode === 'signup'
                      ? 'Verify your email with a 6-digit code to create your account.'
                      : 'Request a 6-digit verification code to set a new password.'}
                </p>
              </div>
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
                className="rounded-lg bg-[#1B499B]/5 border border-[#1B499B]/25 px-3.5 py-3 text-xs text-slate-900 space-y-1.5"
              >
                <p className="leading-relaxed">{otpNotice}</p>
                {previewOtpCode && (
                  <p className="font-mono font-semibold text-[#1B499B]">
                    Verification Code:{' '}
                    <span className="tracking-widest text-sm text-[#E31E24]">
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
                      className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1B499B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]/25"
                    />
                  </div>
                </div>
              )}

              {/* Email + Send Verification Code button (for Sign Up & Forgot Password) */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5">
                  <label
                    htmlFor="auth-email"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    Email Address
                  </label>

                  {mode === 'signup' && testResetEnabled && (
                    <button
                      type="button"
                      disabled={resettingTestEmail}
                      onClick={handleResetTestEmail}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#E31E24] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] rounded px-1 py-0.5"
                    >
                      <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>
                        {resettingTestEmail
                          ? 'Resetting...'
                          : 'Reset this email for re-testing'}
                      </span>
                    </button>
                  )}
                </div>

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
                      placeholder="name@masbina.com"
                      className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1B499B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]/25"
                    />
                  </div>

                  {(mode === 'signup' || mode === 'forgot') && (
                    <button
                      type="button"
                      disabled={sendingOtp}
                      onClick={handleSendOtp}
                      className="min-h-[48px] px-3.5 py-2.5 rounded-lg border border-[#1B499B]/30 bg-[#1B499B]/5 hover:bg-[#1B499B]/10 text-xs font-semibold text-[#1B499B] inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]"
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
                        const digits = e.target.value
                          .replace(/\D/g, '')
                          .slice(0, 6);
                        setOtp(digits);
                        if (error) setError(null);
                      }}
                      placeholder="000000"
                      className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm font-mono tracking-[0.25em] text-slate-900 tabular-nums focus:border-[#1B499B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]/25"
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
                    className="w-full min-h-[48px] bg-white border border-slate-300 rounded-lg pl-10 pr-12 py-2.5 text-sm text-slate-900 focus:border-[#1B499B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 rounded-md text-slate-500 hover:text-[#1B499B] hover:bg-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]"
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
                  className="flex items-start gap-2 rounded-lg bg-[#E31E24]/5 border border-[#E31E24]/30 px-3.5 py-2.5 text-sm text-[#B81419]"
                >
                  <AlertTriangle className="w-4 h-4 text-[#E31E24] shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-[#1B499B] hover:bg-[#153A7C] active:scale-[0.99] text-white font-semibold text-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] focus-visible:ring-offset-2"
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
                    className="min-h-[40px] px-1 font-semibold text-[#1B499B] hover:text-[#153A7C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] rounded"
                  >
                    Sign up as new user
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="min-h-[40px] px-1 font-semibold text-[#E31E24] hover:text-[#C5171C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E31E24] rounded"
                  >
                    Forgot password
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="min-h-[40px] px-1 font-semibold text-[#1B499B] hover:text-[#153A7C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] rounded"
                >
                  Back to Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
