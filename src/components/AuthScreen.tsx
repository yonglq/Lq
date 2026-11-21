import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  RotateCcw,
  User,
} from 'lucide-react';
import { authClient } from '../services/authClient';
import { AuthSession, evaluatePasswordRules } from '../types/auth';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
}

type AuthMode = 'login' | 'signup' | 'forgot';
type FlowStep = 1 | 2;

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
  const [step, setStep] = useState<FlowStep>(1);

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [testResetEnabled, setTestResetEnabled] = useState<boolean>(false);
  const [resettingTestEmail, setResettingTestEmail] = useState<boolean>(false);

  const [sendingOtp, setSendingOtp] = useState<boolean>(false);
  const [resendingOtp, setResendingOtp] = useState<boolean>(false);
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
    setStep(1);
    setError(null);
    setSuccessMsg(null);
    setOtp('');
    setPassword('');
    setShowPassword(false);
  };

  const handleResetTestEmail = async () => {
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter the email address you want to reset for re-testing.');
      return;
    }

    setResettingTestEmail(true);
    try {
      const res = await authClient.resetTestAccount(trimmedEmail);
      setOtp('');
      setStep(1);
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

  const handleStep1Continue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();

    if (mode === 'signup' && fullName.trim().length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (!passwordRules.isValid) {
      setError(
        'Password must be at least 8 characters and include at least one letter, one number, and one symbol.'
      );
      return;
    }

    setSendingOtp(true);
    try {
      await authClient.sendOtp({
        email: trimmedEmail,
        purpose: mode === 'signup' ? 'signup' : 'reset',
      });
      setOtp('');
      setStep(2);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send verification email. Please check email settings.'
      );
    } finally {
      setSendingOtp(false);
    }
  };

  const handleResendCode = async () => {
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setResendingOtp(true);
    try {
      await authClient.sendOtp({
        email: trimmedEmail,
        purpose: mode === 'signup' ? 'signup' : 'reset',
      });
      setOtp('');
      setSuccessMsg(`A new 6-digit verification code was sent to ${trimmedEmail}.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send verification email. Please check email settings.'
      );
    } finally {
      setResendingOtp(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email address and password are required.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await authClient.login({
        email: trimmedEmail,
        password,
      });
      onAuthenticated(session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep2VerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    const trimmedOtp = otp.trim();

    if (!/^\d{6}$/.test(trimmedOtp)) {
      setError('Enter the 6-digit verification code sent to your email.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const session = await authClient.signup({
          full_name: fullName.trim(),
          email: trimmedEmail,
          otp: trimmedOtp,
          password,
        });
        onAuthenticated(session);
      } else if (mode === 'forgot') {
        const res = await authClient.resetPassword({
          email: trimmedEmail,
          otp: trimmedOtp,
          newPassword: password,
        });
        switchMode('login');
        setEmail(trimmedEmail);
        setSuccessMsg(res.message);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Verification failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isTwoStepMode = mode === 'signup' || mode === 'forgot';

  return (
    <div className="min-h-screen bg-[#F4F6F8] flex flex-col justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        {/* Unified White Auth Card with MasBina Security Alarm Branding */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          {/* Dual-Tone Brand Accent Bar: Royal Blue (#1B499B) + Security Red (#E31E24) */}
          <div className="h-1.5 w-full flex" aria-hidden="true">
            <div className="w-3/4 bg-[#1B499B]" />
            <div className="w-1/4 bg-[#E31E24]" />
          </div>

          <div className="px-6 pt-8 pb-7 sm:px-7 space-y-5">
            {/* MasBina Security Alarm Logo with generous vertical clearance */}
            <div className="text-center space-y-3 pb-4 border-b border-slate-100">
              <div className="py-1 px-2 flex items-center justify-center">
                <img
                  src="/images/masbina-logo.png"
                  alt="MasBina Security Alarm Since 1986"
                  className="max-h-28 w-auto max-w-[260px] object-contain block"
                />
              </div>

              <div>
                <h1 className="font-display text-lg font-bold tracking-tight text-[#1B499B]">
                  {mode === 'login'
                    ? 'Sign In to Your Account'
                    : mode === 'signup'
                      ? step === 1
                        ? 'Sign Up as New User'
                        : 'Verify Your Email'
                      : step === 1
                        ? 'Reset Your Password'
                        : 'Verify Password Reset'}
                </h1>
                <p className="text-xs text-slate-600 mt-1">
                  {mode === 'login'
                    ? 'Access MasBina Security Alarm field van inventory & claim controls.'
                    : mode === 'signup'
                      ? step === 1
                        ? 'Enter your account details and choose a strong password.'
                        : 'Complete verification to activate your account.'
                      : step === 1
                        ? 'Enter your account email and choose a new password.'
                        : 'Confirm the verification code sent to your inbox.'}
                </p>
              </div>

              {/* Clean Step Progress Bar for Sign Up & Forgot Password */}
              {isTwoStepMode && (
                <div className="pt-1 space-y-1.5" aria-label={`Step ${step} of 2`}>
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-[#1B499B]">
                      Step {step} of 2
                    </span>
                    <span className="text-slate-500">
                      {step === 1
                        ? mode === 'signup'
                          ? 'Account Details & Password'
                          : 'Email & New Password'
                        : 'Email Verification'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full bg-[#1B499B] transition-all duration-200 ${
                        step === 1 ? 'w-1/2' : 'w-full'
                      }`}
                    />
                  </div>
                </div>
              )}
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

            {/* ============================================================
                LOGIN FORM
               ============================================================ */}
            {mode === 'login' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-sm font-semibold text-slate-700 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
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
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-sm font-semibold text-slate-700 mb-1.5"
                  >
                    Password
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
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter your password"
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
                  {submitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* ============================================================
                STEP 1: SIGN UP & FORGOT PASSWORD (DETAILS & PASSWORD FIRST)
               ============================================================ */}
            {isTwoStepMode && step === 1 && (
              <form
                onSubmit={handleStep1Continue}
                className="space-y-4"
                noValidate
              >
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
                        <RotateCcw
                          className="w-3 h-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          {resettingTestEmail
                            ? 'Resetting...'
                            : 'Reset this email for re-testing'}
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="relative">
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
                </div>

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
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="8+ chars with letter, number & symbol"
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

                <PasswordChecklist password={password} />

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
                  disabled={sendingOtp}
                  className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-[#1B499B] hover:bg-[#153A7C] active:scale-[0.99] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] focus-visible:ring-offset-2"
                >
                  <span>
                    {sendingOtp
                      ? 'Sending Verification Code...'
                      : 'Next: Verify Email'}
                  </span>
                  {!sendingOtp && (
                    <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                </button>
              </form>
            )}

            {/* ============================================================
                STEP 2: FINAL EMAIL VERIFICATION STEP (6-DIGIT OTP)
               ============================================================ */}
            {isTwoStepMode && step === 2 && (
              <form
                onSubmit={handleStep2VerifySubmit}
                className="space-y-4"
                noValidate
              >
                <div className="rounded-lg bg-[#1B499B]/5 border border-[#1B499B]/20 px-4 py-3.5 text-sm text-slate-800 space-y-1">
                  <p className="leading-relaxed">
                    We sent a 6-digit verification code to{' '}
                    <span className="font-semibold text-[#1B499B] break-all">
                      {email.trim()}
                    </span>
                    .
                  </p>
                  <p className="text-xs text-slate-600">
                    Check your inbox (and spam folder). The code expires in 10
                    minutes.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="auth-otp"
                      className="block text-sm font-semibold text-slate-700"
                    >
                      6-Digit Verification Code
                    </label>
                    <button
                      type="button"
                      disabled={resendingOtp}
                      onClick={handleResendCode}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B499B] hover:text-[#153A7C] hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] rounded px-1 py-0.5"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${resendingOtp ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{resendingOtp ? 'Resending...' : 'Resend Code'}</span>
                    </button>
                  </div>

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
                      autoComplete="one-time-code"
                      autoFocus
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
                      className="w-full min-h-[52px] bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-base font-mono font-semibold tracking-[0.3em] text-slate-900 tabular-nums focus:border-[#1B499B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]/25"
                    />
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg bg-[#E31E24]/5 border border-[#E31E24]/30 px-3.5 py-2.5 text-sm text-[#B81419]"
                  >
                    <AlertTriangle className="w-4 h-4 text-[#E31E24] shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setStep(1);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="min-h-[48px] px-4 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B]"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>Back</span>
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 min-h-[48px] px-5 py-3 rounded-lg bg-[#1B499B] hover:bg-[#153A7C] active:scale-[0.99] text-white font-semibold text-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B499B] focus-visible:ring-offset-2"
                  >
                    {submitting
                      ? 'Verifying...'
                      : mode === 'signup'
                        ? 'Verify & Create Account'
                        : 'Verify & Reset Password'}
                  </button>
                </div>
              </form>
            )}

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
