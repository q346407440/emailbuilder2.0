import type { FastifyInstance, FastifyRequest } from 'fastify';
import { google } from 'googleapis';
import { nanoid } from 'nanoid';
import nodemailer from 'nodemailer';
import { encrypt, decrypt } from '../../../lib/crypto.js';
import {
  listGmailAuthorizationsByUserId,
  getGmailAuthorizationById,
  createOrUpdateGmailAuthorization,
  deleteGmailAuthorization,
  getUserLastSelectedGmailId,
  updateUserLastSelectedGmailId,
} from '../../../db/index.js';

type AuthRequest = FastifyRequest & { userId: string };

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getFrontendOrigin(): string {
  const url = process.env.FRONTEND_URL;
  if (url) return url.replace(/\/$/, '');
  return 'http://localhost:5173';
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/** 修復常見的 UTF-8 → Latin1 亂碼（如 "Ã§Â¬Â¬"）。 */
function repairLikelyMojibake(text: string): string {
  try {
    const cjkCount = (s: string) => (s.match(/[\u3400-\u9FFF]/g) || []).length;
    const mojibakeCount = (s: string) => (s.match(/[ÃÂ]/g) || []).length;

    // 兼容雙重亂碼（如 "Ã§Â¬Â¬"）：最多連續修復 3 輪，挑選更優結果
    let best = text;
    let current = text;
    for (let i = 0; i < 3; i++) {
      const next = Buffer.from(current, 'latin1').toString('utf-8');
      if (next === current) break;
      current = next;

      const betterCjk = cjkCount(current) > cjkCount(best);
      const sameCjkLessMojibake =
        cjkCount(current) === cjkCount(best) && mojibakeCount(current) < mojibakeCount(best);
      if (betterCjk || sameCjkLessMojibake) {
        best = current;
      }
    }
    return best;
  } catch {
    // ignore
  }
  return text;
}


/** 輪詢用：暫存某用戶的 OAuth 結果（callback 寫入，opener 輪詢取走後刪除） */
const oauthPendingByUserId = new Map<
  string,
  { status: 'completed' | 'error'; email?: string; errorCode?: string }
>();

export async function registerGmailRoutes(app: FastifyInstance): Promise<void> {

  // ---- 輪詢授權結果（主頁開彈窗後輪詢此接口，彈窗關閉則停止輪詢） ----
  app.get('/api/gmail/oauth-pending', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const result = oauthPendingByUserId.get(userId);
    if (!result) {
      return reply.send({ status: 'pending' as const });
    }
    oauthPendingByUserId.delete(userId);
    return reply.send(result);
  });

  // ---- 列出已授權 Gmail 帳號（回傳 camelCase 供前端顯示信箱等） ----
  app.get('/api/gmail/accounts', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const [rows, lastSelectedGmailId] = await Promise.all([
      listGmailAuthorizationsByUserId(userId),
      getUserLastSelectedGmailId(userId),
    ]);
    const accounts = rows.map((r) => ({
      id: r.id,
      gmailAddress: r.gmail_address,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
    return reply.send({ accounts, lastSelectedGmailId });
  });

  // ---- 開始 OAuth 授權流程（從 query param 讀 token，因為是瀏覽器重定向） ----
  app.get('/api/gmail/connect', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) return reply.status(401).send({ error: '缺少 token' });
    let userId: string;
    try {
      const payload = app.jwt.verify<{ userId: string }>(token);
      userId = payload.userId;
    } catch {
      return reply.status(401).send({ error: 'token 无效或已过期' });
    }
    const oauth2 = getOAuth2Client();
    const state = app.jwt.sign({ userId }, { expiresIn: '10m' });
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });
    return reply.redirect(url);
  });

  // ---- Google OAuth 回調（不需 JWT；寫入輪詢結果後重定向到「可關閉」頁） ----
  const oauthDonePath = '/gmail-oauth-done';
  app.get('/api/gmail/callback', async (req, reply) => {
    const front = getFrontendOrigin();
    const { code, state, error: oauthError } = req.query as Record<string, string>;

    const setErrorAndRedirect = (errorCode: string) => {
      if (userId) oauthPendingByUserId.set(userId, { status: 'error', errorCode });
      return reply.redirect(`${front}${oauthDonePath}`);
    };

    let userId: string | undefined;
    if (oauthError) {
      try {
        const payload = app.jwt.verify<{ userId: string }>(state || '');
        userId = payload.userId;
      } catch {
        userId = undefined;
      }
      if (userId) oauthPendingByUserId.set(userId, { status: 'error', errorCode: oauthError });
      return reply.redirect(`${front}${oauthDonePath}`);
    }
    if (!code || !state) {
      return reply.redirect(`${front}${oauthDonePath}`);
    }

    try {
      const payload = app.jwt.verify<{ userId: string }>(state);
      userId = payload.userId;
    } catch {
      return reply.redirect(`${front}${oauthDonePath}`);
    }

    const oauth2 = getOAuth2Client();
    let tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null };
    try {
      const { tokens: t } = await oauth2.getToken(code);
      tokens = t;
    } catch (err) {
      console.error('Gmail OAuth getToken failed:', err);
      return setErrorAndRedirect('token_exchange_failed');
    }

    if (!tokens.access_token || !tokens.refresh_token) {
      return setErrorAndRedirect('no_refresh_token');
    }

    oauth2.setCredentials(tokens);
    let gmailAddress: string;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`userinfo ${res.status}: ${text}`);
      }
      const data = (await res.json()) as { email?: string };
      gmailAddress = data.email?.trim() ?? '';
      if (!gmailAddress) throw new Error('userinfo 未返回 email');
    } catch (err) {
      console.error('Gmail 取得授權信箱失敗:', err);
      return setErrorAndRedirect('profile_fetch_failed');
    }

    const now = Date.now();
    await createOrUpdateGmailAuthorization({
      id: nanoid(),
      user_id: userId,
      gmail_address: gmailAddress,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      token_expiry: tokens.expiry_date ?? now + 3600_000,
      created_at: now,
      updated_at: now,
    });

    oauthPendingByUserId.set(userId, { status: 'completed', email: gmailAddress });
    return reply.redirect(`${front}${oauthDonePath}`);
  });

  // ---- 解除 Gmail 授權 ----
  app.delete('/api/gmail/accounts/:id', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const { id } = req.params as { id: string };
    const ok = await deleteGmailAuthorization(id, userId);
    if (!ok) return reply.status(404).send({ error: '未找到该授权' });
    return reply.send({ ok: true });
  });

  // ---- 設定上次選擇的 Gmail 帳號 ----
  app.put('/api/gmail/accounts/last', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const { gmailId } = req.body as { gmailId: string | null };
    await updateUserLastSelectedGmailId(userId, gmailId);
    return reply.send({ ok: true });
  });

  // ---- 發送郵件 ----
  app.post('/api/gmail/send', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const body = req.body as {
      gmailAccountId: string;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      htmlBody: string;
    };

    if (!body.gmailAccountId || !body.to?.length || !body.subject || !body.htmlBody) {
      return reply.status(400).send({ error: '缺少必填字段（gmailAccountId, to, subject, htmlBody）' });
    }

    const auth = await getGmailAuthorizationById(body.gmailAccountId, userId);
    if (!auth) {
      return reply.status(404).send({ error: '未找到该 Gmail 授权，请重新授权' });
    }

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
        console.error('Gmail token refresh failed:', err);
        return reply.status(401).send({ error: 'Gmail 授权已过期，请重新授权' });
      }
    } else {
      oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    }

    const subject = repairLikelyMojibake(body.subject.replace(/[\r\n]+/g, ' ').trim());

    try {
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

      if (process.env.NODE_ENV !== 'production') {
        console.log('[gmail/send] transport: smtp-oauth2');
        console.log('[gmail/send] incoming subject:', body.subject);
        console.log('[gmail/send] normalized subject:', subject);
      }

      const result = await transporter.sendMail({
        from: auth.gmail_address,
        to: body.to.join(', '),
        cc: body.cc?.length ? body.cc.join(', ') : undefined,
        bcc: body.bcc?.length ? body.bcc.join(', ') : undefined,
        subject,
        // 与旧链路保持一致：HTML 用 base64 传输，避免 data URL（SVG->PNG）在传输层被折行后失效
        textEncoding: 'base64',
        // 将 data:image/... 自动转为 cid 附件，提升 Gmail 对内联图片的兼容性
        attachDataUrls: true,
        text: body.htmlBody.replace(/<[^>]*>/g, ''),
        html: body.htmlBody,
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[gmail/send] sent via SMTP', {
          messageId: result.messageId,
          accepted: result.accepted,
          rejected: result.rejected,
        });
      }
    } catch (err: unknown) {
      console.error('Gmail send failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.status(500).send({ error: `发送失败：${message}` });
    }

    return reply.send({ ok: true });
  });
}
