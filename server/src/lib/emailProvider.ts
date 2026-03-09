/**
 * ESP 抽象層（Iteration 4）
 * 通過環境變數 EMAIL_PROVIDER=smtp|sendgrid 切換
 */

import nodemailer from 'nodemailer';

export interface SendOptions {
  to: string;
  subject: string;
  html: string;
  messageId?: string;
  fromName: string;
  fromEmail: string;
  previewText?: string;
}

export interface SendResult {
  messageId: string;
  status: 'sent' | 'failed';
  error?: string;
}

export interface EmailProvider {
  send(options: SendOptions): Promise<SendResult>;
}

// ─── SMTP Provider (default) ──────────────────────────────────────────────────

class SmtpProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT ?? '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass },
      });
    } else {
      // Ethereal test account fallback (for dev)
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: process.env.ETHEREAL_USER ?? '',
          pass: process.env.ETHEREAL_PASS ?? '',
        },
      });
    }
  }

  async send(options: SendOptions): Promise<SendResult> {
    const html = options.previewText
      ? options.html.replace(
          '<body',
          `<body><div style="display:none;max-height:0;overflow:hidden">${options.previewText}</div`
        )
      : options.html;

    try {
      const info = await this.transporter.sendMail({
        from: `"${options.fromName}" <${options.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html,
        messageId: options.messageId,
      });
      return { messageId: String(info.messageId ?? options.messageId ?? ''), status: 'sent' };
    } catch (err) {
      return {
        messageId: options.messageId ?? '',
        status: 'failed',
        error: err instanceof Error ? err.message : 'SMTP send failed',
      };
    }
  }
}

// ─── SendGrid Provider ────────────────────────────────────────────────────────

class SendGridProvider implements EmailProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(options: SendOptions): Promise<SendResult> {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: options.to }] }],
          from: { email: options.fromEmail, name: options.fromName },
          subject: options.subject,
          content: [{ type: 'text/html', value: options.html }],
          custom_args: options.messageId ? { message_id: options.messageId } : undefined,
        }),
      });
      if (res.status === 202) {
        return { messageId: options.messageId ?? '', status: 'sent' };
      }
      const body = await res.text();
      return { messageId: options.messageId ?? '', status: 'failed', error: body.slice(0, 200) };
    } catch (err) {
      return { messageId: options.messageId ?? '', status: 'failed', error: String(err) };
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

let _provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (_provider) return _provider;

  const provider = process.env.EMAIL_PROVIDER ?? 'smtp';
  if (provider === 'sendgrid') {
    const key = process.env.SENDGRID_API_KEY ?? '';
    if (!key) console.warn('[emailProvider] SENDGRID_API_KEY not set, falling back to SMTP');
    else { _provider = new SendGridProvider(key); return _provider; }
  }

  _provider = new SmtpProvider();
  return _provider;
}

export function getFromInfo(): { fromName: string; fromEmail: string } {
  return {
    fromName: process.env.FROM_NAME ?? 'Email Editor',
    fromEmail: process.env.FROM_EMAIL ?? 'noreply@example.com',
  };
}

export function getAppBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
}
