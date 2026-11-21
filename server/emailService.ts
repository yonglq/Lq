import nodemailer from 'nodemailer';
import type { OtpPurpose } from './otpStore.ts';

export interface EmailDeliveryResult {
  deliveredVia: 'smtp' | 'preview';
  previewCode?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<EmailDeliveryResult> {
  const subject =
    params.purpose === 'signup'
      ? 'VanSpare Sync — Email Verification Code'
      : 'VanSpare Sync — Password Reset Verification Code';

  const actionText =
    params.purpose === 'signup'
      ? 'complete your account registration'
      : 'reset your password';

  if (isSmtpConfigured()) {
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
      text: `Your VanSpare Sync verification code is: ${params.code}\n\nUse this 6-digit code within 10 minutes to ${actionText}. If you did not request this code, you can safely ignore this message.`,
    });

    return { deliveredVia: 'smtp' };
  }

  // In production, never return OTP over HTTP; require real SMTP configuration
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SMTP email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.'
    );
  }

  // In development/preview before SMTP secrets are configured, deliver a preview code
  return {
    deliveredVia: 'preview',
    previewCode: params.code,
  };
}
