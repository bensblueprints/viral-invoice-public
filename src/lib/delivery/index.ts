import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveryJobs } from "@/db/schema";
import type { DeliveryJob } from "@/db/schema";
import { sendEmail } from "./email";
import { postWebhook } from "./webhook";

/** Retry backoff ladder in minutes. Exhausting it marks the job 'dead'. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

// Payload shapes stored (frozen) on the job row.
export interface WebhookJobPayload {
  url: string;
  body: unknown;
}
export interface EmailJobPayload {
  to: string;
  subject: string;
  body: string;
}
export interface ExternalPurchaseJobPayload {
  url: string;
  body: {
    secret: string | null;
    amountCents: number;
    externalRef: string;
    email: string | null;
  };
}

function minutesFromNow(mins: number): Date {
  return new Date(Date.now() + mins * 60_000);
}

async function runJob(job: DeliveryJob): Promise<void> {
  if (job.type === "webhook") {
    const p = job.payloadJson as unknown as WebhookJobPayload;
    await postWebhook(p.url, p.body);
  } else if (job.type === "email") {
    const p = job.payloadJson as unknown as EmailJobPayload;
    await sendEmail({ to: p.to, subject: p.subject, body: p.body });
  } else if (job.type === "external_purchase") {
    const p = job.payloadJson as unknown as ExternalPurchaseJobPayload;
    await postWebhook(p.url, p.body);
  } else {
    throw new Error(`Unknown delivery job type: ${job.type}`);
  }
}

/** Process one job by id: run it, then mark succeeded or schedule a retry. */
export async function processDeliveryJob(jobId: string): Promise<void> {
  const [job] = await db
    .select()
    .from(deliveryJobs)
    .where(eq(deliveryJobs.id, jobId))
    .limit(1);
  if (!job || job.status === "succeeded" || job.status === "dead") return;

  try {
    await runJob(job);
    await db
      .update(deliveryJobs)
      .set({ status: "succeeded", lastError: null, updatedAt: new Date() })
      .where(eq(deliveryJobs.id, job.id));
  } catch (err) {
    const attempt = job.attemptCount + 1;
    const exhausted = attempt >= BACKOFF_MINUTES.length;
    const delay = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];
    await db
      .update(deliveryJobs)
      .set({
        attemptCount: attempt,
        status: exhausted ? "dead" : "failed",
        lastError: err instanceof Error ? err.message : String(err),
        nextAttemptAt: exhausted ? job.nextAttemptAt : minutesFromNow(delay),
        updatedAt: new Date(),
      })
      .where(eq(deliveryJobs.id, job.id));
  }
}

/**
 * Cron entry point: claim due pending/failed jobs (SKIP LOCKED so concurrent
 * runners don't double-send) and process them. Returns how many ran.
 */
export async function runDueDeliveryJobs(limit = 25): Promise<number> {
  const claimed = await db.execute(sql`
    UPDATE ${deliveryJobs}
    SET status = 'processing', updated_at = now()
    WHERE id IN (
      SELECT id FROM ${deliveryJobs}
      WHERE status IN ('pending', 'failed')
        AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id
  `);

  const rows = claimed as unknown as Array<{ id: string }>;
  for (const row of rows) {
    await processDeliveryJob(row.id);
  }
  return rows.length;
}

/** Re-queue a job for immediate retry (dashboard "retry now"). */
export async function retryDeliveryJobNow(jobId: string): Promise<void> {
  await db
    .update(deliveryJobs)
    .set({ status: "pending", nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(deliveryJobs.id, jobId),
        lte(deliveryJobs.attemptCount, 999),
      ),
    );
  await processDeliveryJob(jobId);
}
