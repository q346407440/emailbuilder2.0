/**
 * Gmail 發送工具（共用）
 * 統一處理 token 刷新、subject 修復、nodemailer 發送。
 * 供 gmail.routes.ts、templates.routes.ts（send-test）、endpoints.routes.ts（send）複用。
 */

import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import type { GmailAuthorizationRow } from '../db/index.js';
import { encrypt, decrypt } from './crypto.js';
import { createOrUpdateGmailAuthorization } from '../db/index.js';

/** 修復常見的 UTF-8 → Latin1 亂碼（如 "Ã§Â¬Â¬"）。 */
function repairLikelyMojibake(text: string): string {
  try {
    const cjkCount = (s: string) => (s.match(/[\u3400-\u9FFF]/g) || []).length;
    const mojibakeCount = (s: string) => (s.match(/[ÃÂ]/g) || []).length;
    let best = text;
    let current = text;
    for (let i = 0; i < 3; i++) {
      const next = Buffer.from(current, 'latin1').toString('utf-8');
      if (next === current) break;
      current = next;
      const betterCjk = cjkCount(current) > cjkCount(best);
      const sameCjkLessMojibake =
        cjkCount(current) === cjkCount(best) && mojibakeCount(current) < mojibakeCount(best);
      if (betterCjk || sameCjkLessMojibake) best = current;
    }
    return best;
  } catch {
    return text;
  }
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export interface GmailSendOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * 使用 Gmail OAuth2 發送郵件。
 * 自動處理 token 刷新（並寫回 DB）、subject 亂碼修復。
 * 若 token 已過期且刷新失敗，拋出錯誤。
 */
export async function sendViaGmail(
  auth: GmailAuthorizationRow,
  options: GmailSendOptions
): Promise<void> {
  const oauth2 = getOAuth2Client();
  let accessToken = decrypt(auth.access_token_enc);
  const refreshToken = decrypt(auth.refresh_token_enc);

  if (Date.now() >= auth.token_expiry - 60_000) {
    oauth2.setCredentials({ refresh_token: refreshToken });
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      accessToken = credentials.access_token ?? accessToken;
      const now = Date.now();
      await createOrUpdateGmailAuthorization({
        ...auth,
        access_token_enc: encrypt(accessToken),
        token_expiry: credentials.expiry_date ?? now + 3600_000,
        updated_at: now,
      });
    } catch (err) {
      throw new Error(`Gmail 授权已过期，请重新授权：${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  }

  const subject = repairLikelyMojibake(options.subject.replace(/[\r\n]+/g, ' ').trim());

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: auth.gmail_address,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken,
      accessToken,
    },
  });

  await transporter.sendMail({
    from: auth.gmail_address,
    to: options.to,
    subject,
    textEncoding: 'base64',
    attachDataUrls: true,
    text: options.html.replace(/<[^>]*>/g, ''),
    html: options.html,
  });
}
