import nodemailer from 'nodemailer';
import type { OtpPurpose } from './otpStore.ts';

export const EMAIL_DELIVERY_ERROR_MESSAGE =
  'Failed to send verification email. Please check email settings.';

interface SmtpErrorLike extends Error {
  code?: string;
  response?: string;
  responseCode?: number;
  command?: string;
}

export class EmailDeliveryError extends Error {
  public readonly detailedMessage: string;
  public readonly code?: string;
  public readonly response?: string;

  constructor(
    detailedMessage: string,
    opts?: { code?: string; response?: string }
  ) {
    super(EMAIL_DELIVERY_ERROR_MESSAGE);
    this.name = 'EmailDeliveryError';
    this.detailedMessage = detailedMessage;
    this.code = opts?.code;
    this.response = opts?.response;
  }
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      getNormalizedSmtpPass().length > 0
  );
}

export function isEmailDeliveryConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

export function getActiveEmailProvider(): 'resend' | 'smtp' | 'none' {
  if (isResendConfigured()) return 'resend';
  if (isSmtpConfigured()) return 'smtp';
  return 'none';
}

function getNormalizedSmtpPass(): string {
  // Strip accidental spaces (Gmail App Passwords are often copied as "abcd efgh ijkl mnop")
  return (process.env.SMTP_PASS ?? '').replace(/\s+/g, '');
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim() ?? '';
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = port === 465;
  const user = process.env.SMTP_USER?.trim() ?? '';
  const pass = getNormalizedSmtpPass();
  const from = process.env.SMTP_FROM?.trim() || user;
  return { host, port, secure, user, pass, from };
}

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? '';
  const from =
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    'MasBina Security <onboarding@resend.dev>';
  return { apiKey, from };
}

function validateResendApiKey(apiKey: string): string | null {
  if (!/^[\x20-\x7E]+$/.test(apiKey) || !apiKey.startsWith('re_')) {
    return 'Email delivery failed: RESEND_API_KEY must be a valid Resend API key starting with "re_" (replace any placeholder text).';
  }
  return null;
}

export function getMissingEmailConfigReason(): string {
  const hasAnySmtpVar = Boolean(
    process.env.SMTP_HOST?.trim() ||
      process.env.SMTP_USER?.trim() ||
      process.env.SMTP_PASS?.trim()
  );

  if (hasAnySmtpVar) {
    const missing: string[] = [];
    if (!process.env.SMTP_HOST?.trim()) missing.push('SMTP_HOST');
    if (!process.env.SMTP_USER?.trim()) missing.push('SMTP_USER');
    if (getNormalizedSmtpPass().length === 0) missing.push('SMTP_PASS');
    if (missing.length > 0) {
      return `Email delivery failed: Missing ${missing.join(', ')} in environment variables.`;
    }
  }

  return 'Email delivery failed: SMTP_USER / RESEND_API_KEY is not configured in environment variables.';
}

function createSmtpTransporter() {
  const cfg = getSmtpConfig();
  return {
    cfg,
    transporter: nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure, // true for 465, false for 587 (STARTTLS)
      requireTLS: !cfg.secure && cfg.port === 587,
      auth: {
        user: cfg.user,
        pass: cfg.pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    }),
  };
}

function describeSmtpError(err: unknown): {
  detailedMessage: string;
  code?: string;
  response?: string;
} {
  const smtpErr = err as SmtpErrorLike;
  const code = typeof smtpErr?.code === 'string' ? smtpErr.code : undefined;
  const response =
    typeof smtpErr?.response === 'string' ? smtpErr.response : undefined;
  const message =
    smtpErr instanceof Error ? smtpErr.message : 'Unknown SMTP error';

  console.error('SMTP email error:', {
    message,
    code,
    responseCode: smtpErr?.responseCode,
    command: smtpErr?.command,
    response,
  });

  if (code === 'EAUTH' || smtpErr?.responseCode === 535) {
    return {
      detailedMessage: `Email delivery failed: Invalid SMTP credentials (${code ?? '535'}). Verify SMTP_USER and your Gmail App Password.${response ? ` Server response: ${response}` : ''}`,
      code,
      response,
    };
  }

  if (
    code === 'ECONNECTION' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ESOCKET'
  ) {
    return {
      detailedMessage: `Email delivery failed: Unable to connect to SMTP server (${code}) — ${message}`,
      code,
      response,
    };
  }

  return {
    detailedMessage: `Email delivery failed: ${message}${code ? ` (${code})` : ''}${response ? ` — ${response}` : ''}`,
    code,
    response,
  };
}

export function formatEmailErrorForClient(
  err: unknown,
  includeDetails: boolean
): string {
  if (!includeDetails) {
    return EMAIL_DELIVERY_ERROR_MESSAGE;
  }
  if (err instanceof EmailDeliveryError) {
    return err.detailedMessage;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return EMAIL_DELIVERY_ERROR_MESSAGE;
}

function buildEmailContent(params: { code: string; purpose: OtpPurpose }) {
  const subject =
    params.purpose === 'signup'
      ? 'MasBina Security Alarm — Email Verification Code'
      : 'MasBina Security Alarm — Password Reset Verification Code';

  const actionText =
    params.purpose === 'signup'
      ? 'complete your account registration'
      : 'reset your password';

  const text = [
    `MasBina Security Alarm`,
    ``,
    `Your 6-digit verification code is: ${params.code}`,
    ``,
    `Enter this code within 10 minutes to ${actionText}.`,
    `If you did not request this code, you can safely ignore this email.`,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
      <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="height: 6px; background: linear-gradient(90deg, #1B499B 75%, #E31E24 75%);"></div>
        <div style="padding: 24px;">
          <h2 style="margin: 0 0 8px; font-size: 18px; color: #1B499B;">MasBina Security Alarm</h2>
          <p style="margin: 0 0 20px; font-size: 14px; color: #475569;">
            Use the 6-digit verification code below to ${actionText}:
          </p>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
            <span style="font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700; letter-spacing: 0.25em; color: #1B499B;">${params.code}</span>
          </div>
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            This code expires in 10 minutes and allows up to 5 verification attempts. If you did not request this code, please ignore this email.
          </p>
        </div>
      </div>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<void> {
  const { subject, text, html } = buildEmailContent({
    code: params.code,
    purpose: params.purpose,
  });

  // 1. Automatically prefer Resend HTTP API if RESEND_API_KEY is configured
  if (isResendConfigured()) {
    const { apiKey, from } = getResendConfig();
    const keyFormatError = validateResendApiKey(apiKey);
    if (keyFormatError) {
      console.error('Resend API key format error:', { reason: keyFormatError });
      throw new EmailDeliveryError(keyFormatError, {
        code: 'INVALID_RESEND_KEY_FORMAT',
      });
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [params.to],
          subject,
          text,
          html,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as {
          message?: string;
          name?: string;
        } | null;
        const apiMsg =
          errorBody?.message || `Resend API returned HTTP ${response.status}`;
        console.error('Resend API email error:', {
          status: response.status,
          name: errorBody?.name,
          message: apiMsg,
        });
        throw new EmailDeliveryError(
          `Email delivery failed (Resend HTTP ${response.status}): ${apiMsg}`,
          { code: `RESEND_${response.status}`, response: apiMsg }
        );
      }
      return;
    } catch (err) {
      if (err instanceof EmailDeliveryError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Unknown network error';
      console.error('Resend API network error:', { message: msg });
      throw new EmailDeliveryError(
        `Email delivery failed (Resend network error): ${msg}`
      );
    }
  }

  // 2. Otherwise use Nodemailer SMTP (Gmail SMTP or custom SMTP)
  if (isSmtpConfigured()) {
    const { cfg, transporter } = createSmtpTransporter();
    try {
      await transporter.sendMail({
        from: cfg.from,
        to: params.to,
        subject,
        text,
        html,
      });
      return;
    } catch (err) {
      const info = describeSmtpError(err);
      throw new EmailDeliveryError(info.detailedMessage, {
        code: info.code,
        response: info.response,
      });
    }
  }

  // 3. Neither provider is configured — never leak OTP over HTTP
  const reason = getMissingEmailConfigReason();
  console.error('Email provider unconfigured:', { reason });
  throw new EmailDeliveryError(reason, { code: 'EMAIL_NOT_CONFIGURED' });
}

export interface EmailHealthResult {
  ok: boolean;
  provider: 'resend' | 'smtp' | 'none';
  message: string;
  details: Record<string, unknown>;
}

export async function verifyEmailProviderHealth(): Promise<EmailHealthResult> {
  const envConfigured = {
    RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY?.trim()),
    EMAIL_FROM: Boolean(process.env.EMAIL_FROM?.trim()),
    RESEND_FROM: Boolean(process.env.RESEND_FROM?.trim()),
    SMTP_HOST: Boolean(process.env.SMTP_HOST?.trim()),
    SMTP_PORT: process.env.SMTP_PORT?.trim() || '587 (default)',
    SMTP_USER: Boolean(process.env.SMTP_USER?.trim()),
    SMTP_PASS: getNormalizedSmtpPass().length > 0,
    SMTP_FROM: Boolean(process.env.SMTP_FROM?.trim()),
  };

  if (isResendConfigured()) {
    const { apiKey, from } = getResendConfig();
    const keyFormatError = validateResendApiKey(apiKey);
    if (keyFormatError) {
      return {
        ok: false,
        provider: 'resend',
        message: keyFormatError,
        details: { from, envConfigured },
      };
    }

    try {
      const response = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (response.ok) {
        return {
          ok: true,
          provider: 'resend',
          message: 'Resend API connection authenticated and ready.',
          details: { from, envConfigured },
        };
      }

      const errorBody = (await response.json().catch(() => null)) as {
        message?: string;
        name?: string;
      } | null;
      const apiMsg =
        errorBody?.message || `Resend API returned HTTP ${response.status}`;

      // Sending-only Resend keys intentionally return 401 on GET /domains with a restriction message
      if (
        response.status === 401 &&
        /restricted to only send/i.test(apiMsg)
      ) {
        return {
          ok: true,
          provider: 'resend',
          message:
            'Resend sending-only API key detected and authenticated for email delivery.',
          details: { from, restrictedSendOnly: true, envConfigured },
        };
      }

      console.error('Resend health verification failed:', {
        status: response.status,
        message: apiMsg,
      });
      return {
        ok: false,
        provider: 'resend',
        message: `Resend API authentication failed (HTTP ${response.status}): ${apiMsg}`,
        details: { from, status: response.status, envConfigured },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown network error';
      console.error('Resend health network error:', { message: msg });
      return {
        ok: false,
        provider: 'resend',
        message: `Unable to reach Resend API: ${msg}`,
        details: { from, envConfigured },
      };
    }
  }

  if (isSmtpConfigured()) {
    const { cfg, transporter } = createSmtpTransporter();
    try {
      await transporter.verify();
      return {
        ok: true,
        provider: 'smtp',
        message: 'SMTP connection authenticated and ready.',
        details: {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          starttls: !cfg.secure && cfg.port === 587,
          user: cfg.user,
          from: cfg.from,
          envConfigured,
        },
      };
    } catch (err) {
      const info = describeSmtpError(err);
      return {
        ok: false,
        provider: 'smtp',
        message: info.detailedMessage,
        details: {
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          user: cfg.user,
          from: cfg.from,
          code: info.code,
          response: info.response,
          envConfigured,
        },
      };
    }
  }

  return {
    ok: false,
    provider: 'none',
    message: getMissingEmailConfigReason(),
    details: { envConfigured },
  };
}
