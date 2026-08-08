import type { PreferenceCommand } from "./deterministic-command";
import type { PreferenceRepository } from "./ports";
import {
  preferenceUndoTtlMs,
  validatePreferenceValues,
  type PreferenceProfile,
  type PreferenceValidationIssue,
} from "../domains/preferences/preferences";
import type { Authorizer } from "../security/authorization";
import type { Clock, IdGenerator, UserScope } from "../shared/contracts";

export interface ManagePreferencesDependencies {
  readonly authorizer: Authorizer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly preferences: PreferenceRepository;
}

export interface ManagePreferencesRequest {
  readonly actorUserId: string;
  readonly scope: UserScope;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly command: PreferenceCommand;
}

const usage =
  "Usa: /impostazioni imposta <lingua> <timezone IANA> <12h|24h> <valuta>. " +
  "Esempio: /impostazioni imposta it Europe/Rome 24h EUR";

function renderProfile(profile: PreferenceProfile): string {
  return [
    `Lingua: ${profile.language}`,
    `Timezone: ${profile.timeZone}`,
    `Formato ora: ${profile.hourFormat}`,
    `Valuta: ${profile.defaultCurrency}`,
  ].join("\n");
}

function validationMessage(issue: PreferenceValidationIssue): string {
  switch (issue) {
    case "language":
      return `Lingua non supportata. Per ora è disponibile: it.\n${usage}`;
    case "time_zone":
      return `Timezone non valida. Usa un identificatore IANA, per esempio Europe/Rome.\n${usage}`;
    case "hour_format":
      return `Formato ora non valido. Scegli 12h oppure 24h.\n${usage}`;
    case "currency":
      return `Valuta non valida. Usa un codice ISO 4217, per esempio EUR.\n${usage}`;
  }
}

export async function managePreferences(
  request: ManagePreferencesRequest,
  dependencies: ManagePreferencesDependencies,
): Promise<string> {
  const now = dependencies.clock.now();

  if (request.command.kind === "preferences.invalid") {
    await dependencies.authorizer.authorize({
      actorUserId: request.actorUserId,
      scope: request.scope,
      action: "preferences:read",
    });
    return usage;
  }

  if (request.command.kind === "preferences.read") {
    await dependencies.authorizer.authorize({
      actorUserId: request.actorUserId,
      scope: request.scope,
      action: "preferences:read",
    });
    await dependencies.preferences.purgeExpiredUndo(request.scope, now, 100);
    const profile = await dependencies.preferences.get(request.scope);
    return profile === null
      ? `Impostazioni non configurate.\n${usage}`
      : `Impostazioni attuali:\n${renderProfile(profile)}`;
  }

  if (request.command.kind === "preferences.set") {
    await dependencies.authorizer.authorize({
      actorUserId: request.actorUserId,
      scope: request.scope,
      action: "preferences:write",
    });
    const validated = validatePreferenceValues(request.command);
    if (!validated.ok) {
      return validationMessage(validated.issue);
    }
    await dependencies.preferences.purgeExpiredUndo(request.scope, now, 100);
    const undoExpiresAt = new Date(now.getTime() + preferenceUndoTtlMs);
    const result = await dependencies.preferences.set(
      request.scope,
      validated.value,
      {
        actorUserId: request.actorUserId,
        correlationId: request.correlationId,
        idempotencyKey: request.idempotencyKey,
        auditId: dependencies.ids.newId(),
        undoToken: dependencies.ids.newId(),
        now,
        undoExpiresAt,
      },
    );
    const heading =
      result.outcome === "updated"
        ? "Impostazioni aggiornate."
        : result.outcome === "created"
          ? "Impostazioni salvate."
          : "Impostazioni già applicate.";
    const undoMessage =
      result.undoToken === null || result.undoExpiresAt === null
        ? "Undo non più disponibile per questa modifica."
        : result.undoExpiresAt.getTime() <= now.getTime()
          ? "Undo scaduto per questa modifica."
          : `Undo entro 15 minuti: /annulla ${result.undoToken}`;
    return `${heading}\n${renderProfile(result.profile)}\n${undoMessage}`;
  }

  await dependencies.authorizer.authorize({
    actorUserId: request.actorUserId,
    scope: request.scope,
    action: "preferences:undo",
  });
  const result = await dependencies.preferences.undo(
    request.scope,
    request.command.token,
    {
      actorUserId: request.actorUserId,
      correlationId: request.correlationId,
      idempotencyKey: request.idempotencyKey,
      auditId: dependencies.ids.newId(),
      now,
    },
  );
  switch (result.outcome) {
    case "reverted":
      return result.profile === null
        ? "Modifica annullata. Le preferenze non sono più configurate."
        : `Modifica annullata.\n${renderProfile(result.profile)}`;
    case "duplicate":
      return result.profile === null
        ? "Undo già applicato. Le preferenze non sono configurate."
        : `Undo già applicato.\n${renderProfile(result.profile)}`;
    case "expired":
      return "Undo scaduto: le impostazioni non sono state modificate.";
    case "used":
      return "Undo già usato: le impostazioni non sono state modificate.";
    case "stale":
      return "Undo non applicabile: le impostazioni sono cambiate nel frattempo.";
    case "not_found":
      return "Undo non disponibile per questo utente.";
  }
}
