/**
 * 自動化流程執行器（共享邏輯，被 worker.ts 和 shoplazza-integration.ts 共用）
 */
import * as db from '../db/index.js';
import { getEmailProvider, getFromInfo, getAppBaseUrl } from './emailProvider.js';

/** 創建 enrollment 並立即執行第一個步驟（inline，無需 Redis） */
export async function triggerAutomationsInline(
  triggerType: string,
  contactId: string,
  userId: string,
  triggerData?: unknown
): Promise<void> {
  const automations = await db.listActiveAutomationsByTrigger(triggerType);
  for (const auto of automations) {
    if (auto.user_id !== userId) continue;
    const enrollment = await db.createEnrollment({ automationId: auto.id, contactId, userId, triggerData });
    if (enrollment) {
      console.log(`[Automation] Created enrollment ${enrollment.id} for ${triggerType} (inline)`);
      // Execute first step immediately (inline, no Redis needed)
      void runEnrollmentInline(enrollment.id);
    }
  }
}

/** 執行一個 enrollment 的步驟（完全 inline，不依賴 BullMQ） */
export async function runEnrollmentInline(enrollmentId: string): Promise<void> {
  const enrollment = await db.getEnrollmentById(enrollmentId);
  if (!enrollment || enrollment.status !== 'active') return;

  const autoRes = await db.queryDb(`SELECT * FROM automations WHERE id = $1`, [enrollment.automation_id]);
  const auto = autoRes.rows[0] as unknown as db.AutomationRow | undefined;
  if (!auto || auto.status === 'paused') return;

  const steps = Array.isArray(auto.steps) ? (auto.steps as Record<string, unknown>[]) : [];

  if (enrollment.current_step >= steps.length) {
    await db.completeEnrollment(enrollmentId);
    return;
  }

  const step = steps[enrollment.current_step];
  const stepType = String(step?.type ?? '');

  switch (stepType) {
    case 'wait': {
      const cfg = (step?.config ?? {}) as Record<string, unknown>;
      const amount = Number(cfg.amount ?? 1);
      const unit = String(cfg.unit ?? 'hour');
      const ms = unit === 'minute' ? amount * 60000 : unit === 'day' ? amount * 86400000 : amount * 3600000;
      await db.updateEnrollmentStep(enrollmentId, enrollment.current_step, new Date(Date.now() + ms));
      // Timer in worker.ts will pick this up later
      return;
    }

    case 'condition': {
      const cfg = (step?.config ?? {}) as Record<string, unknown>;
      const exitIfTrue = Boolean(step?.exitIfTrue);
      let met = false;
      if (String(cfg.check) === 'order_paid') {
        const res = await db.queryDb<{ count: string }>(
          `SELECT COUNT(*) as count FROM abandoned_checkouts WHERE contact_id = $1 AND status = 'converted'`,
          [enrollment.contact_id]
        );
        met = parseInt(res.rows[0]?.count ?? '0', 10) > 0;
      }
      if (met && exitIfTrue) {
        await db.exitEnrollment(enrollmentId, `Condition ${String(cfg.check)} met`);
        return;
      }
      await db.updateEnrollmentStep(enrollmentId, enrollment.current_step + 1, null);
      await runEnrollmentInline(enrollmentId);
      break;
    }

    case 'send_email': {
      const cfg = (step?.config ?? {}) as Record<string, unknown>;
      const templateId = cfg.templateId ? String(cfg.templateId) : null;
      const subject = String(cfg.subject ?? '自动化邮件');

      const contact = await db.getContactById(enrollment.contact_id, enrollment.user_id);
      if (!contact?.email) {
        await db.updateEnrollmentStep(enrollmentId, enrollment.current_step + 1, null);
        await runEnrollmentInline(enrollmentId);
        return;
      }

      let html = `<html><body><h2>${subject}</h2><p>Hi ${contact.name ?? contact.email},</p><p>此邮件由自动化流程触发。</p></body></html>`;
      if (templateId) {
        const tmpl = await db.getTemplate(templateId);
        if (tmpl) {
          html = `<html><body><div style="max-width:600px;margin:0 auto;padding:20px"><h2 style="color:#1976D2">${tmpl.title}</h2><p>${tmpl.desc ?? subject}</p></div></body></html>`;
        }
      }

      const unsubToken = await db.ensureUnsubscribeToken(contact.id, enrollment.user_id);
      const baseUrl = getAppBaseUrl();
      const frontendUrl = baseUrl.includes('localhost') ? baseUrl.replace(':3001', ':5173') : baseUrl;
      html = html.replace('</body>', `<p style="text-align:center;font-size:11px;color:#aaa"><a href="${frontendUrl}/unsubscribe?token=${unsubToken}">退訂</a></p></body>`);

      const { fromName, fromEmail } = getFromInfo();
      const sendId = await db.createAutomationEmailSend({
        automationId: enrollment.automation_id,
        enrollmentId,
        contactId: contact.id,
        userId: enrollment.user_id,
      });

      const result = await getEmailProvider().send({ to: contact.email, subject, html, fromName, fromEmail });
      await db.updateEmailSend(sendId, { status: result.status === 'sent' ? 'sent' : 'failed', sentAt: new Date().toISOString() });
      console.log(`[Automation] Sent email to ${contact.email}: ${result.status}`);

      await db.updateEnrollmentStep(enrollmentId, enrollment.current_step + 1, null);
      await runEnrollmentInline(enrollmentId);
      break;
    }

    case 'end':
      await db.completeEnrollment(enrollmentId);
      break;

    default:
      await db.updateEnrollmentStep(enrollmentId, enrollment.current_step + 1, null);
      await runEnrollmentInline(enrollmentId);
  }
}
