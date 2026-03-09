import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import * as db from '../db/index.js';

const SALT_ROUNDS = 10;
const JWT_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN ?? '7d';
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7', 10);

function refreshTokenCookieName() {
  return 'refresh_token';
}

function getCookieDomain(): string | undefined {
  return process.env.COOKIE_DOMAIN || undefined;
}

function isSecure(): boolean {
  return process.env.NODE_ENV === 'production';
}

interface RegisterBody {
  email: string;
  password: string;
  displayName?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface ProfileBody {
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface PasswordBody {
  currentPassword: string;
  newPassword: string;
}

interface JwtPayload {
  userId: string;
  email: string;
}

function toUserDto(row: db.UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    isAdmin: row.is_admin,
    defaultTemplateId: row.default_template_id ?? null,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterBody }>('/api/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const { email, password, displayName } = req.body ?? {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return reply.status(400).send({ error: '请提供邮箱和密码' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return reply.status(400).send({ error: '邮箱不能为空' });
    if (password.length < 6) return reply.status(400).send({ error: '密码至少 6 位' });

    const existing = await db.getUserByEmail(trimmedEmail);
    if (existing) return reply.status(409).send({ error: '该邮箱已注册' });

    const officialDefaultId = (process.env.OFFICIAL_DEFAULT_TEMPLATE_ID ?? '').trim();
    let defaultTemplateId: string | null = null;
    if (officialDefaultId) {
      const template = await db.getTemplate(officialDefaultId);
      if (template?.is_public) defaultTemplateId = officialDefaultId;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const now = Date.now();
    const id = nanoid();
    await db.createUser({
      id,
      email: trimmedEmail,
      password_hash: passwordHash,
      display_name: displayName?.trim() || null,
      avatar_url: null,
      is_admin: false,
      created_at: now,
      updated_at: now,
      default_template_id: defaultTemplateId,
    });

    const user = await db.getUserById(id);
    if (!user) return reply.status(500).send({ error: '注册失败' });

    const token = app.jwt.sign(
      { userId: user.id, email: user.email } as JwtPayload,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Issue refresh token
    await issueRefreshToken(app, reply, id);

    return reply.send({ token, user: toUserDto(user) });
  });

  app.post<{ Body: LoginBody }>('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
      return reply.status(400).send({ error: '请提供邮箱和密码' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const user = await db.getUserByEmail(trimmedEmail);
    if (!user) return reply.status(401).send({ error: '邮箱或密码错误' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return reply.status(401).send({ error: '邮箱或密码错误' });

    const token = app.jwt.sign(
      { userId: user.id, email: user.email } as JwtPayload,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Issue refresh token
    await issueRefreshToken(app, reply, user.id);

    return reply.send({ token, user: toUserDto(user) });
  });

  app.get('/api/auth/me', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<JwtPayload>();
      const user = await db.getUserById(payload.userId);
      if (!user) return reply.status(401).send({ error: '用户不存在' });
      return reply.send({ user: toUserDto(user) });
    } catch {
      return reply.status(401).send({ error: '请重新登录' });
    }
  });

  app.put<{ Body: ProfileBody }>('/api/auth/profile', async (req: FastifyRequest<{ Body: ProfileBody }>, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<JwtPayload>();
      const { displayName, avatarUrl } = req.body ?? {};
      const updated = await db.updateUserProfile(payload.userId, {
        display_name: displayName !== undefined ? displayName : undefined,
        avatar_url: avatarUrl !== undefined ? avatarUrl : undefined,
      });
      if (!updated) return reply.status(404).send({ error: '用户不存在' });
      const user = await db.getUserById(payload.userId);
      if (!user) return reply.status(500).send({ error: '更新失败' });
      return reply.send({ user: toUserDto(user) });
    } catch (e) {
      if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode: number }).statusCode === 401) {
        return reply.status(401).send({ error: '请重新登录' });
      }
      throw e;
    }
  });

  app.put<{ Body: PasswordBody }>('/api/auth/password', async (req: FastifyRequest<{ Body: PasswordBody }>, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<JwtPayload>();
      const { currentPassword, newPassword } = req.body ?? {};
      if (!currentPassword || !newPassword) {
        return reply.status(400).send({ error: '请提供当前密码和新密码' });
      }
      if (newPassword.length < 6) return reply.status(400).send({ error: '新密码至少 6 位' });

      const user = await db.getUserById(payload.userId);
      if (!user) return reply.status(401).send({ error: '请重新登录' });

      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) return reply.status(400).send({ error: '当前密码错误' });

      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await db.updateUserPassword(user.id, passwordHash);
      return reply.send({ ok: true });
    } catch (e) {
      if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode: number }).statusCode === 401) {
        return reply.status(401).send({ error: '请重新登录' });
      }
      throw e;
    }
  });

  interface PreferencesBody {
    defaultTemplateId?: string | null;
  }
  app.put<{ Body: PreferencesBody }>('/api/auth/preferences', async (req: FastifyRequest<{ Body: PreferencesBody }>, reply: FastifyReply) => {
    try {
      const payload = await req.jwtVerify<JwtPayload>();
      const userId = payload.userId;
      const { defaultTemplateId } = req.body ?? {};
      const id = defaultTemplateId === undefined || defaultTemplateId === null || defaultTemplateId === '' ? null : String(defaultTemplateId).trim();
      if (id !== null) {
        const template = await db.getTemplate(id);
        if (!template) return reply.status(404).send({ error: '模板不存在' });
        if (template.user_id !== userId && !template.is_public) {
          return reply.status(403).send({ error: '只能将本人创建的或公共模板设为默认' });
        }
      }
      const updated = await db.updateUserDefaultTemplateId(userId, id);
      if (!updated) return reply.status(404).send({ error: '用户不存在' });
      const user = await db.getUserById(userId);
      if (!user) return reply.status(500).send({ error: '更新失败' });
      return reply.send({ user: toUserDto(user) });
    } catch (e) {
      if (e && typeof e === 'object' && 'statusCode' in e && (e as { statusCode: number }).statusCode === 401) {
        return reply.status(401).send({ error: '请重新登录' });
      }
      throw e;
    }
  });

  // ─── Refresh Token ───────────────────────────────────────────────────────────

  app.post('/api/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieToken = (req.cookies as Record<string, string | undefined>)[refreshTokenCookieName()];
    if (!cookieToken) {
      return reply.status(401).send({ error: '请重新登录' });
    }

    // Find matching, non-revoked, non-expired refresh token
    const result = await db.queryDb<{
      id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null;
    }>(
      `SELECT id, user_id, token_hash, expires_at, revoked_at
       FROM refresh_tokens
       WHERE expires_at > NOW() AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 50`
    );

    let matchedRow: typeof result.rows[0] | null = null;
    for (const row of result.rows) {
      const match = await bcrypt.compare(cookieToken, row.token_hash);
      if (match) { matchedRow = row; break; }
    }

    if (!matchedRow) {
      reply.clearCookie(refreshTokenCookieName(), { path: '/' });
      return reply.status(401).send({ error: '请重新登录' });
    }

    // Rotate: revoke old token
    await db.queryDb(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
      [matchedRow.id]
    );

    const user = await db.getUserById(matchedRow.user_id);
    if (!user) {
      reply.clearCookie(refreshTokenCookieName(), { path: '/' });
      return reply.status(401).send({ error: '用户不存在' });
    }

    // Issue new access token + new refresh token
    const newAccessToken = app.jwt.sign(
      { userId: user.id, email: user.email } as JwtPayload,
      { expiresIn: JWT_EXPIRES_IN }
    );
    await issueRefreshToken(app, reply, user.id);

    return reply.send({ token: newAccessToken, user: toUserDto(user) });
  });

  // ─── Logout ──────────────────────────────────────────────────────────────────

  app.post('/api/auth/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const cookieToken = (req.cookies as Record<string, string | undefined>)[refreshTokenCookieName()];
    if (cookieToken) {
      // Revoke all matching refresh tokens (best-effort)
      const result = await db.queryDb<{ id: string; token_hash: string }>(
        `SELECT id, token_hash FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > NOW()`
      );
      for (const row of result.rows) {
        const match = await bcrypt.compare(cookieToken, row.token_hash).catch(() => false);
        if (match) {
          await db.queryDb(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
          break;
        }
      }
    }
    reply.clearCookie(refreshTokenCookieName(), { path: '/' });
    return reply.send({ ok: true });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function issueRefreshToken(app: FastifyInstance, reply: FastifyReply, userId: string): Promise<void> {
  const tokenValue = nanoid(64);
  const tokenHash = await bcrypt.hash(tokenValue, 10);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  const id = nanoid();

  // Store in DB (table created by migration script)
  try {
    await db.queryDb(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, userId, tokenHash, expiresAt.toISOString()]
    );
  } catch (err) {
    // Table may not exist yet (before migration) — log and continue
    console.warn('[auth] refresh_tokens table not ready, skipping refresh token issue:', (err as Error).message);
    return;
  }

  reply.setCookie(refreshTokenCookieName(), tokenValue, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
    expires: expiresAt,
  });
}
