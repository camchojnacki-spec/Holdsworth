import { db, pricingJobs } from "@holdsworth/db";
import { eq, and, lte, sql, asc, desc } from "drizzle-orm";
import { handlePriceLookup } from "./handlers/price-lookup";
import { log, logError } from "./lib/logger";
import type { CardPricePayload } from "@holdsworth/db";

const WORKER_ID = `worker-${process.pid}`;
const POLL_INTERVAL_MS = 5_000; // 5 seconds
const STALE_LOCK_MINUTES = 10;

let running = true;

/**
 * Recover stale locks from crashed workers.
 */
async function recoverStaleLocks() {
  const staleThreshold = new Date(Date.now() - STALE_LOCK_MINUTES * 60 * 1000);

  const stale = await db
    .update(pricingJobs)
    .set({ status: "pending", lockedAt: null, lockedBy: null })
    .where(
      and(
        eq(pricingJobs.status, "running"),
        lte(pricingJobs.lockedAt, staleThreshold)
      )
    )
    .returning({ id: pricingJobs.id });

  if (stale.length > 0) {
    log("worker", `Recovered ${stale.length} stale jobs`);
  }
}

/**
 * Claim the next available job using FOR UPDATE SKIP LOCKED.
 */
async function claimJob() {
  // Raw SQL for FOR UPDATE SKIP LOCKED (not supported in Drizzle's query builder)
  const result = await db.execute(sql`
    UPDATE pricing_jobs
    SET status = 'running', locked_at = NOW(), locked_by = ${WORKER_ID}, updated_at = NOW()
    WHERE id = (
      SELECT id FROM pricing_jobs
      WHERE status = 'pending'
        AND scheduled_for <= NOW()
        AND (error_count < max_retries)
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, card_id, job_type, payload
  `);

  if (!result || (result as unknown[]).length === 0) return null;

  const row = (result as Record<string, unknown>[])[0];
  return {
    id: row.id as string,
    cardId: row.card_id as string,
    jobType: row.job_type as string,
    payload: row.payload as CardPricePayload,
  };
}

/**
 * Mark a job as completed.
 */
async function completeJob(jobId: string, result: Record<string, unknown>) {
  await db
    .update(pricingJobs)
    .set({
      status: "completed",
      result,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pricingJobs.id, jobId));
}

/**
 * Mark a job as failed with retry logic.
 */
async function failJob(jobId: string, errorMessage: string, currentErrorCount: number, maxRetries: number) {
  const newErrorCount = currentErrorCount + 1;
  const shouldRetry = newErrorCount < maxRetries;

  // Exponential backoff: 30s, 60s, 120s
  const backoffMs = Math.pow(2, newErrorCount) * 30_000;

  await db
    .update(pricingJobs)
    .set({
      status: shouldRetry ? "pending" : "failed",
      errorMessage,
      errorCount: newErrorCount,
      scheduledFor: shouldRetry ? new Date(Date.now() + backoffMs) : undefined,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(pricingJobs.id, jobId));

  if (shouldRetry) {
    log("worker", `Job ${jobId} failed (attempt ${newErrorCount}/${maxRetries}), retrying in ${backoffMs / 1000}s`);
  } else {
    logError("worker", `Job ${jobId} permanently failed after ${maxRetries} attempts: ${errorMessage}`);
  }
}

/**
 * Process a single job.
 */
async function processJob(job: { id: string; cardId: string; jobType: string; payload: CardPricePayload }) {
  log("worker", `Processing job ${job.id} (${job.jobType})`, { cardId: job.cardId });
  const startTime = Date.now();

  try {
    let result: Record<string, unknown>;

    switch (job.jobType) {
      case "price_lookup":
        result = await handlePriceLookup(job.id, job.cardId, job.payload) as unknown as Record<string, unknown>;
        break;
      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await completeJob(job.id, result);
    log("worker", `Job ${job.id} completed in ${elapsed}s`, result);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : String(err);
    logError("worker", `Job ${job.id} failed after ${elapsed}s`, err);

    // Get current error count
    const [currentJob] = await db
      .select({ errorCount: pricingJobs.errorCount, maxRetries: pricingJobs.maxRetries })
      .from(pricingJobs)
      .where(eq(pricingJobs.id, job.id))
      .limit(1);

    await failJob(job.id, message, currentJob?.errorCount ?? 0, currentJob?.maxRetries ?? 3);
  }
}

/**
 * Main worker loop.
 */
export async function startWorker() {
  log("worker", `Starting pricing engine (${WORKER_ID})`);

  // Recover stale locks on startup
  await recoverStaleLocks();

  while (running) {
    try {
      const job = await claimJob();

      if (job) {
        await processJob(job);
      } else {
        // No jobs available, sleep
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      logError("worker", "Unexpected error in poll loop", err);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  log("worker", "Worker stopped");
}

/**
 * Graceful shutdown.
 */
export function stopWorker() {
  running = false;
}
