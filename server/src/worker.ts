/**
 * BullMQ Worker 進程（獨立進程，與 API Server 分離）
 * 啟動方式：cd server && npx tsx src/worker.ts
 *
 * Queues：
 * - webhook-processing:     Shoplazza Webhook 異步處理
 * - contact-sync:           從 Shoplazza 批量同步聯繫人
 * - broadcast-send:         廣播郵件發送
 * - automation-step-runner: 自動化流程步驟執行（Iter-5 新增）
 */
import 'dotenv/config';
import { Worker, Queue, type Job } from 'bullmq';
import * as db from './db/index.js';
import { decrypt } from './lib/crypto.js';
import { fetchShoplazzaCustomers } from './lib/shoplazza.js';
import { processCustomerCreate } from './routes/shoplazza-integration.js';
import { getEmailProvider, getFromInfo, getAppBaseUrl } from './lib/emailProvider.js';
import { processBroadcastInline } from './routes/broadcasts.js';
import { runEnrollmentInline, triggerAutomationsInline } from './lib/automationRunner.js';

// BullMQ connection options
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
function parseRedisUrl(url: string) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: parseInt(u.port || '6379', 10), password: u.password || undefined, enableOfflineQueue: false, connectTimeout: 2000 };
  } catch {
    return { host: 'localhost', port: 6379, enableOfflineQueue: false };
  }
}
const bullMQConnection = parseRedisUrl(REDIS_URL);

/** Try to push a job to a queue, ignoring Redis unavailability */
async function tryEnqueue(queueName: string, jobName: string, data: unknown): Promise<void> {
  try {
    const q = new Queue(queueName, { connection: bullMQConnection });
    await Promise.race([
      q.add(jobName, data),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('BullMQ timeout')), 2000)),
    ]);
    await q.close();
  } catch (err) {
    console.warn(`[Worker] tryEnqueue ${queueName} failed:`, err instanceof Error ? err.message : err);
  }
}

console.log('[Worker] Starting BullMQ workers...');

// ─── Automation helpers (use shared module) ────────────────────────────────

async function runAutomationStep(enrollmentId: string): Promise<void> {
  return runEnrollmentInline(enrollmentId);
}

async function triggerAutomations(triggerType: string, contactId: string, userId: string, triggerData?: unknown): Promise<void> {
  return triggerAutomationsInline(triggerType, contactId, userId, triggerData);
}

// (Implementation moved to lib/automationRunner.ts)

// ─── Queue: webhook-processing ─────────────────────────────────────────────

const webhookWorker = new Worker(
  'webhook-processing',
  async (job: Job) => {
    const { webhookEventId, topic, shopDomain, payload } = job.data as {
      webhookEventId: string; topic: string; shopDomain: string; payload: unknown;
    };

    console.log(`[Worker] Processing webhook: ${topic} from ${shopDomain} (id: ${webhookEventId})`);

    try {
      const integration = await db.getShopIntegrationByDomain(shopDomain);
      if (!integration) {
        await db.markWebhookProcessed(webhookEventId, `No integration for domain ${shopDomain}`);
        return;
      }
      const userId = integration.user_id;

      switch (topic) {
        case 'customers/create': {
          // Upsert contact
          await processCustomerCreate(userId, payload, shopDomain);
          // Find newly created contact
          const payloadObj = (typeof payload === 'object' && payload !== null) ? (payload as Record<string, unknown>) : {};
          const email = String(payloadObj.email ?? '').trim().toLowerCase();
          if (email) {
            const contactRes = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            const contactId = contactRes.rows[0]?.id;
            if (contactId) {
              await triggerAutomations('customer_created', contactId, userId, payload);
            }
          }
          break;
        }

        case 'orders/paid': {
          const payloadObj = (typeof payload === 'object' && payload !== null) ? (payload as Record<string, unknown>) : {};
          const email = String(payloadObj.email ?? (payloadObj.customer as Record<string,unknown>)?.email ?? '').trim().toLowerCase();
          const checkoutToken = String(payloadObj.checkout_token ?? '');

          // Mark abandoned checkout as converted
          if (checkoutToken) {
            await db.markCheckoutConverted(checkoutToken);
            // Exit any active abandoned_cart enrollments for this contact
            if (email) {
              await db.queryDb(
                `UPDATE automation_enrollments ae SET status='exited', exited_at=NOW(), exit_reason='order_paid'
                 FROM automations a, contacts c
                 WHERE ae.automation_id = a.id AND ae.contact_id = c.id
                   AND a.trigger_type = 'abandoned_cart' AND ae.status = 'active'
                   AND c.email = $1`, [email]
              );
            }
          }

          // Trigger order_paid automations
          if (email) {
            const contactRes = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            const contactId = contactRes.rows[0]?.id;
            if (contactId) {
              await triggerAutomations('order_paid', contactId, userId, payload);
            }
          }
          break;
        }

        case 'fulfillments/create': {
          const payloadObj = (typeof payload === 'object' && payload !== null) ? (payload as Record<string, unknown>) : {};
          // Get order email from fulfillment
          const email = String(payloadObj.email ?? '').trim().toLowerCase();
          if (email) {
            const contactRes = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            const contactId = contactRes.rows[0]?.id;
            if (contactId) {
              await triggerAutomations('order_fulfilled', contactId, userId, payload);
            }
          }
          break;
        }

        case 'checkouts/create': {
          const checkout = (typeof payload === 'object' && payload !== null) ? (payload as Record<string, unknown>) : {};
          const checkoutToken = String(checkout.token ?? checkout.id ?? job.id);
          const email = String((checkout.email as string) ?? '').trim().toLowerCase();

          // Find contact
          let contactId: string | null = null;
          if (email) {
            const res = await db.queryDb<{ id: string }>(
              `SELECT id FROM contacts WHERE user_id = $1 AND email = $2 LIMIT 1`, [userId, email]
            );
            contactId = res.rows[0]?.id ?? null;
          }

          const triggerAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await db.upsertAbandonedCheckout({
            id: checkoutToken, shop_domain: shopDomain, user_id: userId,
            cart_data: payload, trigger_at: triggerAt,
          });

          // Link contact_id to abandoned checkout if found
          if (contactId) {
            await db.queryDb(
              `UPDATE abandoned_checkouts SET contact_id = $2 WHERE id = $1`, [checkoutToken, contactId]
            );
          }
          console.log(`[Worker] Abandoned checkout ${checkoutToken} triggers at ${triggerAt.toISOString()}`);
          break;
        }

        default:
          console.log(`[Worker] Unhandled topic: ${topic}`);
      }

      await db.markWebhookProcessed(webhookEventId);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Worker] Webhook ${webhookEventId} failed:`, errMsg);
      await db.markWebhookProcessed(webhookEventId, errMsg);
      throw err;
    }
  },
  { connection: bullMQConnection, concurrency: 5, autorun: true }
);

// ─── Queue: contact-sync ───────────────────────────────────────────────────

const contactSyncWorker = new Worker(
  'contact-sync',
  async (job: Job) => {
    const { integrationId, userId, shopDomain } = job.data as { integrationId: string; userId: string; shopDomain: string };
    console.log(`[Worker] Contact sync for ${shopDomain}`);

    const rows = await db.queryDb(`SELECT * FROM shop_integrations WHERE id = $1 AND status='active'`, [integrationId]);
    const integration = rows.rows[0] as unknown as db.ShopIntegrationRow | undefined;
    if (!integration) return;

    let accessToken: string;
    try { accessToken = decrypt(integration.access_token); }
    catch { accessToken = Buffer.from(integration.access_token, 'base64').toString(); }

    let total = 0, page = 1;
    while (true) {
      const result = await fetchShoplazzaCustomers(shopDomain, accessToken, page, 250);
      if (result.customers.length === 0) break;
      for (const c of result.customers) {
        if (!c.email) continue;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || null;
        await db.upsertContact({ user_id: userId, email: c.email.trim().toLowerCase(), name, shoplazza_customer_id: c.id, source: 'shoplazza_sync' });
        total++;
      }
      if (result.nextPage === null) break;
      page = result.nextPage;
      await new Promise((r) => setTimeout(r, 200));
    }
    await db.updateShopIntegrationLastSynced(integrationId);
    console.log(`[Worker] Synced ${total} contacts for ${shopDomain}`);
  },
  { connection: bullMQConnection, concurrency: 2, autorun: true }
);

// ─── Queue: broadcast-send ─────────────────────────────────────────────────

const broadcastSendWorker = new Worker(
  'broadcast-send',
  async (job: Job) => {
    const { broadcastId, userId } = job.data as { broadcastId: string; userId: string };
    await processBroadcastInline(broadcastId, userId);
  },
  { connection: bullMQConnection, concurrency: 2, autorun: true }
);

// ─── Queue: automation-step-runner (Iter-5) ────────────────────────────────

const automationStepWorker = new Worker(
  'automation-step-runner',
  async (job: Job) => {
    const { enrollmentId } = job.data as { enrollmentId: string };
    await runAutomationStep(enrollmentId);
  },
  { connection: bullMQConnection, concurrency: 5, autorun: true }
);

// ─── Timer Jobs ───────────────────────────────────────────────────────────

/** Every 60s: advance enrollments waiting for their next_run_at */
async function tickEnrollments() {
  try {
    const due = await db.listEnrollmentsDue();
    if (due.length > 0) {
      console.log(`[Timer] ${due.length} enrollments due`);
      for (const e of due) {
        await db.updateEnrollmentStep(e.id, e.current_step, null); // clear next_run_at
        await tryEnqueue('automation-step-runner', 'run-step', { enrollmentId: e.id });
        // Inline fallback
        void runAutomationStep(e.id);
      }
    }
  } catch (err) {
    console.warn('[Timer] Enrollment tick failed:', err instanceof Error ? err.message : err);
  }
}

/** Every 5min: check abandoned checkouts and create enrollments */
async function tickAbandonedCheckouts() {
  try {
    const res = await db.queryDb<{ id: string; user_id: string; contact_id: string; cart_data: unknown }>(
      `SELECT id, user_id, contact_id, cart_data FROM abandoned_checkouts
       WHERE status = 'pending' AND trigger_at <= NOW() AND contact_id IS NOT NULL`
    );
    if (res.rows.length > 0) {
      console.log(`[Timer] ${res.rows.length} abandoned checkouts to process`);
    }
    for (const checkout of res.rows) {
      // Find active abandoned_cart automations for this user
      const automations = await db.listActiveAutomationsByTrigger('abandoned_cart');
      for (const auto of automations) {
        if (auto.user_id !== checkout.user_id) continue;
        const enrollment = await db.createEnrollment({
          automationId: auto.id,
          contactId: checkout.contact_id,
          userId: checkout.user_id,
          triggerData: checkout.cart_data,
        });
        if (enrollment) {
          await tryEnqueue('automation-step-runner', 'run-step', { enrollmentId: enrollment.id });
          void runAutomationStep(enrollment.id);
        }
      }
      // Mark as triggered
      await db.queryDb(`UPDATE abandoned_checkouts SET status = 'triggered' WHERE id = $1`, [checkout.id]);
    }
  } catch (err) {
    console.warn('[Timer] Abandoned checkout tick failed:', err instanceof Error ? err.message : err);
  }
}

setInterval(() => void tickEnrollments(), 60_000);
setInterval(() => void tickAbandonedCheckouts(), 5 * 60_000);

// ─── Event handlers ───────────────────────────────────────────────────────

[
  { w: webhookWorker, name: 'webhook-processing' },
  { w: contactSyncWorker, name: 'contact-sync' },
  { w: broadcastSendWorker, name: 'broadcast-send' },
  { w: automationStepWorker, name: 'automation-step-runner' },
].forEach(({ w, name }) => {
  w.on('completed', (job) => console.log(`[Worker] ${name} job ${job.id} completed`));
  w.on('failed', (job, err) => console.error(`[Worker] ${name} job ${job?.id} failed:`, err.message));
});

// ─── Graceful shutdown ────────────────────────────────────────────────────

const shutdown = async () => {
  console.log('[Worker] Shutting down...');
  await Promise.all([
    webhookWorker.close(), contactSyncWorker.close(),
    broadcastSendWorker.close(), automationStepWorker.close(),
  ]);
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Keep unused imports
void getEmailProvider; void getFromInfo; void getAppBaseUrl; void REDIS_URL;

console.log('[Worker] Workers ready. Queues: webhook-processing, contact-sync, broadcast-send, automation-step-runner');
