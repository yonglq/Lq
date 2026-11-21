import nodemailer from 'nodemailer';
import type { OtpPurpose } from './otpStore.ts';

export const EMAIL_DELIVERY_ERROR_MESSAGE =
  'Failed to send verification email. Please check email settings.';

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export function isResendConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      (process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM?.trim())
  );
}

export function isEmailDeliveryConfigured(): boolean {
  return isSmtpConfigured() || isResendConfigured();
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

  if (isSmtpConfigured()) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: port === 465,
        auth: {
          user: process.env.SMTP_USER!.trim(),
          pass: process.env.SMTP_PASS!.trim(),
        },
      });

      const from =
        process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim();

      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text,
        html,
      });
      return;
    } catch (err) {
      console.error(
        'SMTP verification email delivery failed:',
        err instanceof Error ? err.message : 'Unknown SMTP error'
      );
      throw new Error(EMAIL_DELIVERY_ERROR_MESSAGE);
    }
  }

  if (isResendConfigured()) {
    try {
      const from =
        process.env.RESEND_FROM?.trim() || process.env.SMTP_FROM!.trim();
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
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
        throw new Error(`Resend HTTP ${response.status}`);
      }
      return;
    } catch (err) {
      console.error(
        'Resend verification email delivery failed:',
        err instanceof Error ? err.message : 'Unknown Resend error'
      );
      throw new Error(EMAIL_DELIVERY_ERROR_MESSAGE);
    }
  }

  // Never leak or return verification codes over HTTP when email delivery is unconfigured
  console.error(
    'Verification email delivery skipped: neither SMTP_* nor RESEND_API_KEY is configured.'
  );
  throw new Error(EMAIL_DELIVERY_ERROR_MESSAGE);
}
