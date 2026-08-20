import { describe, expect, it } from "vitest";
import { createProposalExecutor } from "../../src/application/manage-ai-proposals";
import {
  createCommandRegistry,
  commandRegistration,
  type CommandContext,
} from "../../src/application/handler-registry";
import type {
  EffectKind,
  EffectRepository,
  EffectStatus,
} from "../../src/application/ports/effects";
import {
  isTaskCommand,
  taskCommandKinds,
} from "../../src/application/commands/tasks";
import type { ProposalPlanItem } from "../../src/application/ai-plan";
import { AppError } from "../../src/shared/errors";
import { FakeClock } from "../helpers";

class MemoryEffects implements EffectRepository {
  readonly rows = new Map<string, EffectStatus>();
  readonly kinds: EffectKind[] = [];

  claim(
    _scope: { userId: string },
    effectKey: string,
    _jobId: string,
    _now: Date,
    kind: EffectKind,
  ): Promise<boolean> {
    if (this.rows.has(effectKey)) return Promise.resolve(false);
    this.rows.set(effectKey, "claimed");
    this.kinds.push(kind);
    return Promise.resolve(true);
  }

  complete(_scope: { userId: string }, effectKey: string): Promise<void> {
    this.rows.set(effectKey, "completed");
    return Promise.resolve();
  }

  release(_scope: { userId: string }, effectKey: string): Promise<void> {
    if (this.rows.get(effectKey) === "claimed") this.rows.delete(effectKey);
    return Promise.resolve();
  }

  get(
    _scope: { userId: string },
    effectKey: string,
  ): Promise<EffectStatus | null> {
    return Promise.resolve(this.rows.get(effectKey) ?? null);
  }
}

const item: ProposalPlanItem = {
  index: 0,
  action: "tasks.create",
  decision: "execute_with_undo",
  slots: {
    title: "Relazione",
    text: null,
    startLocal: null,
    endLocal: null,
    localDate: null,
    due: "nessuna",
    priority: "media",
    entityId: null,
    amountMinor: null,
    currency: null,
    entryKind: null,
    category: null,
  },
  assumptions: [],
  message: null,
};

const context = {
  actorUserId: "user-a",
  scope: { userId: "user-a" },
  chatId: 1,
  messageText: "aggiungi la task relazione",
  forwarded: false,
  correlationId: "corr-1",
  idempotencyKey: "ai-exec:job-1:0",
  jobId: "job-1",
  sentAtUnix: 1_786_173_600,
  aiJobId: "job-1",
};

function registryThatFails(failures: { count: number }) {
  return createCommandRegistry([
    commandRegistration(taskCommandKinds, isTaskCommand, () => {
      if (failures.count > 0) {
        failures.count -= 1;
        return Promise.reject(new AppError("RETRYABLE_EXTERNAL", true));
      }
      return Promise.resolve("Task creata.");
    }),
  ]);
}

describe("C1 esecutore delle proposte", () => {
  it("non lascia un claim appeso quando l'esecuzione fallisce", async () => {
    const effects = new MemoryEffects();
    const failures = { count: 1 };
    const executor = createProposalExecutor({
      clock: new FakeClock(),
      commands: registryThatFails(failures),
      effects,
    });

    await expect(
      executor.execute(
        item,
        context as unknown as CommandContext & {
          aiJobId: string;
        },
      ),
    ).rejects.toEqual(new AppError("RETRYABLE_EXTERNAL", true));
    expect(effects.rows.size).toBe(0);

    // Il retry può eseguire davvero: il ledger non è rimasto bloccato.
    await expect(
      executor.execute(
        item,
        context as unknown as CommandContext & {
          aiJobId: string;
        },
      ),
    ).resolves.toBe("Task creata.");
    expect(effects.rows.get("ai-exec:job-1:0")).toBe("completed");
    expect(effects.kinds).toEqual(["ai_execution", "ai_execution"]);
  });

  it("non riesegue una proposta già applicata", async () => {
    const effects = new MemoryEffects();
    const executor = createProposalExecutor({
      clock: new FakeClock(),
      commands: registryThatFails({ count: 0 }),
      effects,
    });
    const typedContext = context as unknown as CommandContext & {
      aiJobId: string;
    };
    await expect(executor.execute(item, typedContext)).resolves.toBe(
      "Task creata.",
    );
    await expect(executor.execute(item, typedContext)).resolves.toContain(
      "Già applicato",
    );
  });
});
