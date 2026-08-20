import { describe, expect, it } from "vitest";
import {
  isTaskCommand,
  taskCommandKinds,
} from "../../src/application/commands/tasks";
import {
  commandRegistration,
  createCommandRegistry,
  unavailableSliceReply,
  type CommandContext,
} from "../../src/application/handler-registry";
import { createUndoRegistry } from "../../src/application/undo-registry";
import { AppError } from "../../src/shared/errors";

const context: CommandContext = {
  actorUserId: "user-a",
  scope: { userId: "user-a" },
  correlationId: "corr-1",
  idempotencyKey: "idem-1",
  jobId: "job-1",
  sentAtUnix: 1_786_173_600,
};

describe("C0.2 command registry", () => {
  it("risponde in modo utile quando la slice non è registrata", async () => {
    const registry = createCommandRegistry([]);
    expect(registry.has("tasks.list")).toBe(false);
    await expect(
      registry.handle({ kind: "tasks.list" }, context),
    ).resolves.toBe(unavailableSliceReply);
  });

  it("instrada il comando all'handler che possiede quel kind", async () => {
    const registry = createCommandRegistry([
      commandRegistration(taskCommandKinds, isTaskCommand, (command) =>
        Promise.resolve(`gestito:${command.kind}`),
      ),
    ]);
    expect(registry.has("tasks.complete")).toBe(true);
    await expect(
      registry.handle({ kind: "tasks.complete", taskId: "tsk-1" }, context),
    ).resolves.toBe("gestito:tasks.complete");
  });

  it("rifiuta due registrazioni dello stesso kind alla composizione", () => {
    const registration = commandRegistration(
      taskCommandKinds,
      isTaskCommand,
      () => Promise.resolve("una"),
    );
    expect(() => createCommandRegistry([registration, registration])).toThrow(
      AppError,
    );
  });

  it("non esegue un handler con un comando che non gli appartiene", () => {
    const registration = commandRegistration(
      taskCommandKinds,
      isTaskCommand,
      () => Promise.resolve("mai"),
    );
    expect(() => registration.handle({ kind: "lists.list" }, context)).toThrow(
      AppError,
    );
  });
});

describe("C0.2 undo registry", () => {
  const handler = (prefix: string) => ({
    prefix,
    handle: () => Promise.resolve(`gestito:${prefix}`),
  });

  it("assegna il token alla slice che possiede il prefisso", () => {
    const registry = createUndoRegistry([handler("evt_"), handler("lst_")]);
    expect(registry.handlerFor("evt_abc")?.prefix).toBe("evt_");
    expect(registry.handlerFor("lst_abc")?.prefix).toBe("lst_");
    expect(registry.handlerFor("fin_abc")).toBeNull();
  });

  it("usa il fallback senza prefisso solo quando nessuna slice riconosce il token", () => {
    const registry = createUndoRegistry([handler(""), handler("evt_")]);
    expect(registry.handlerFor("evt_abc")?.prefix).toBe("evt_");
    expect(registry.handlerFor("pref-token")?.prefix).toBe("");
  });
});
