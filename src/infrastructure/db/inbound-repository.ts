import { z } from "zod";
import type {
  InboundRepository,
  RegisteredInbound,
} from "../../application/ports/inbound";
import {
  inboundMessageEnvelopeSchema,
  type InboundMessageEnvelope,
} from "../../application/queue-envelope";
import { AppError } from "../../shared/errors";

const storedInboundSchema = z.object({
  envelope_json: z.string(),
  status: z.string(),
});

export class D1InboundRepository implements InboundRepository {
  constructor(private readonly database: D1Database) {}

  async register(
    envelope: InboundMessageEnvelope,
    now: Date,
  ): Promise<RegisteredInbound> {
    const timestamp = now.getTime();
    const result = await this.database
      .prepare(
        `INSERT OR IGNORE INTO inbound_updates (
          update_id, job_id, correlation_id, idempotency_key, status,
          envelope_json, attempt_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending_enqueue', ?, 0, ?, ?)`,
      )
      .bind(
        envelope.payload.updateId,
        envelope.jobId,
        envelope.correlationId,
        envelope.idempotencyKey,
        JSON.stringify(envelope),
        timestamp,
        timestamp,
      )
      .run();

    const row = await this.database
      .prepare(
        "SELECT envelope_json, status FROM inbound_updates WHERE update_id = ?",
      )
      .bind(envelope.payload.updateId)
      .first();
    const parsedRow = storedInboundSchema.safeParse(row);
    if (!parsedRow.success) {
      throw new AppError("INTERNAL_REDACTED", true);
    }

    let storedJson: unknown;
    try {
      storedJson = JSON.parse(parsedRow.data.envelope_json);
    } catch {
      throw new AppError("INTERNAL_REDACTED", false);
    }
    const storedEnvelope = inboundMessageEnvelopeSchema.safeParse(storedJson);
    if (!storedEnvelope.success) {
      throw new AppError("INTERNAL_REDACTED", false);
    }

    return {
      duplicate: result.meta.changes === 0,
      envelope: storedEnvelope.data,
      status: parsedRow.data.status,
    };
  }

  async markEnqueued(jobId: string, now: Date): Promise<void> {
    await this.database
      .prepare(
        `UPDATE inbound_updates
         SET status = CASE WHEN status = 'pending_enqueue' THEN 'enqueued' ELSE status END,
             updated_at = ?
         WHERE job_id = ?`,
      )
      .bind(now.getTime(), jobId)
      .run();
  }

  async claim(
    envelope: InboundMessageEnvelope,
    now: Date,
    leaseSeconds: number,
  ): Promise<"claimed" | "completed" | "busy" | "missing"> {
    const timestamp = now.getTime();
    const leaseExpiresAt = timestamp + leaseSeconds * 1_000;
    const claim = await this.database
      .prepare(
        `UPDATE inbound_updates
         SET status = 'processing', lease_expires_at = ?, attempt_count = attempt_count + 1,
             updated_at = ?
         WHERE job_id = ? AND update_id = ? AND correlation_id = ? AND idempotency_key = ?
           AND envelope_json = ?
           AND (
             status IN ('pending_enqueue', 'enqueued')
             OR (status = 'processing' AND lease_expires_at < ?)
           )
         RETURNING job_id`,
      )
      .bind(
        leaseExpiresAt,
        timestamp,
        envelope.jobId,
        envelope.payload.updateId,
        envelope.correlationId,
        envelope.idempotencyKey,
        JSON.stringify(envelope),
        timestamp,
      )
      .first<{ job_id: string }>();
    if (claim !== null) {
      return "claimed";
    }

    const row = await this.database
      .prepare(
        `SELECT status FROM inbound_updates
         WHERE job_id = ? AND update_id = ? AND correlation_id = ? AND idempotency_key = ?
           AND envelope_json = ?`,
      )
      .bind(
        envelope.jobId,
        envelope.payload.updateId,
        envelope.correlationId,
        envelope.idempotencyKey,
        JSON.stringify(envelope),
      )
      .first<{ status: string }>();
    if (row === null) {
      return "missing";
    }
    if (
      row.status === "completed" ||
      row.status === "completed_ambiguous" ||
      row.status === "dead"
    ) {
      return "completed";
    }
    return "busy";
  }

  async complete(jobId: string, now: Date, ambiguous: boolean): Promise<void> {
    await this.database
      .prepare(
        `UPDATE inbound_updates
         SET status = ?, lease_expires_at = NULL, last_error_code = NULL, updated_at = ?
         WHERE job_id = ?`,
      )
      .bind(
        ambiguous ? "completed_ambiguous" : "completed",
        now.getTime(),
        jobId,
      )
      .run();
  }

  async fail(
    jobId: string,
    now: Date,
    errorCode: string,
    terminal: boolean,
  ): Promise<void> {
    await this.database
      .prepare(
        `UPDATE inbound_updates
         SET status = ?, lease_expires_at = NULL, last_error_code = ?, updated_at = ?
         WHERE job_id = ?`,
      )
      .bind(terminal ? "dead" : "enqueued", errorCode, now.getTime(), jobId)
      .run();
  }

  async listPendingEnqueue(
    before: Date,
    limit: number,
  ): Promise<InboundMessageEnvelope[]> {
    const rows = await this.database
      .prepare(
        `SELECT envelope_json FROM inbound_updates
         WHERE status = 'pending_enqueue' AND updated_at <= ?
         ORDER BY updated_at
         LIMIT ?`,
      )
      .bind(before.getTime(), limit)
      .all<{ envelope_json: string }>();

    const envelopes: InboundMessageEnvelope[] = [];
    for (const row of rows.results) {
      let json: unknown;
      try {
        json = JSON.parse(row.envelope_json);
      } catch {
        continue;
      }
      const parsed = inboundMessageEnvelopeSchema.safeParse(json);
      if (parsed.success) {
        envelopes.push(parsed.data);
      }
    }
    return envelopes;
  }
}
