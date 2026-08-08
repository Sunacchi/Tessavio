export class D1IngressLimiter {
  constructor(private readonly database: D1Database) {}

  async consumeRate(
    bucketKey: string,
    now: Date,
    windowSeconds: number,
    maximum: number,
  ): Promise<boolean> {
    const timestamp = now.getTime();
    const expiresAt = timestamp + windowSeconds * 1_000;
    await this.database.batch([
      this.database
        .prepare("DELETE FROM ingress_rate_limits WHERE window_expires_at < ?")
        .bind(timestamp),
      this.database
        .prepare(
          `INSERT INTO ingress_rate_limits (bucket_key, window_expires_at, request_count)
           VALUES (?, ?, 1)
           ON CONFLICT(bucket_key) DO UPDATE SET request_count = request_count + 1`,
        )
        .bind(bucketKey, expiresAt),
    ]);
    const row = await this.database
      .prepare(
        "SELECT request_count FROM ingress_rate_limits WHERE bucket_key = ?",
      )
      .bind(bucketKey)
      .first<{ request_count: number }>();
    return row !== null && row.request_count <= maximum;
  }

  async acquireConcurrency(
    leaseId: string,
    now: Date,
    leaseSeconds: number,
    maximum: number,
  ): Promise<boolean> {
    const timestamp = now.getTime();
    const results = await this.database.batch([
      this.database
        .prepare("DELETE FROM webhook_concurrency_leases WHERE expires_at < ?")
        .bind(timestamp),
      this.database
        .prepare(
          `INSERT INTO webhook_concurrency_leases (lease_id, expires_at)
           SELECT ?, ?
           WHERE (SELECT COUNT(*) FROM webhook_concurrency_leases) < ?`,
        )
        .bind(leaseId, timestamp + leaseSeconds * 1_000, maximum),
    ]);
    return results[1]?.meta.changes === 1;
  }

  async releaseConcurrency(leaseId: string): Promise<void> {
    await this.database
      .prepare("DELETE FROM webhook_concurrency_leases WHERE lease_id = ?")
      .bind(leaseId)
      .run();
  }
}
