/**
 * Lightweight per-user rate limiting for the AI endpoints, backed by D1.
 *
 * A leaked sync code shouldn't be able to burst `/api/meal-plan` or
 * `/api/food-fact` and chew through the shared Workers AI free allowance.
 * Cost can't run away (the free tier hard-stops), but throughput should.
 *
 * Fixed-window counter: `limit` requests per `windowSec` per key. Fails
 * OPEN — a limiter error never blocks a genuine request.
 */

import type { Env } from './index';

export async function checkRateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSec);
    const bucket = `${key}:${windowStart}`;
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (bucket, count, expires_at)
       VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(bucket, windowStart + windowSec)
      .first<{ count: number }>();

    // Occasionally sweep expired buckets so the table can't grow forever.
    if (Math.random() < 0.02) {
      await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?')
        .bind(now)
        .run();
    }

    return (row?.count ?? 1) <= limit;
  } catch {
    return true; // fail open
  }
}
