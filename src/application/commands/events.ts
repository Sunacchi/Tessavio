import {
  commandKindGuard,
  commandParts,
  entityIdPattern,
  unsupported,
  type CommandRoute,
  type UnsupportedCommand,
} from "./shared";

export type EventDraftCommand =
  | {
      readonly representation: "date_only";
      readonly localDate: string;
      readonly title: string;
    }
  | {
      readonly representation: "instant";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly title: string;
    };

export type EventCommand =
  | ({ readonly kind: "events.create" } & EventDraftCommand)
  | { readonly kind: "events.read"; readonly eventId: string }
  | ({
      readonly kind: "events.update";
      readonly eventId: string;
    } & EventDraftCommand)
  | { readonly kind: "events.cancel"; readonly eventId: string }
  | { readonly kind: "events.today" }
  | { readonly kind: "events.tomorrow" }
  | { readonly kind: "events.invalid" };

export function parseEventCommand(text: string): EventCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const title = separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandParts(commandText);
  const operation = parts[1]?.toLowerCase();

  if (
    separatorIndex === -1 &&
    operation === "leggi" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "events.read", eventId: parts[2] ?? "" };
  }
  if (
    separatorIndex === -1 &&
    operation === "annulla" &&
    parts.length === 3 &&
    entityIdPattern.test(parts[2] ?? "")
  ) {
    return { kind: "events.cancel", eventId: parts[2] ?? "" };
  }
  if (title === null) return { kind: "events.invalid" };

  const representation = parts[2]?.toLowerCase();
  if (operation === "crea" && representation === "data" && parts.length === 4) {
    return {
      kind: "events.create",
      representation: "date_only",
      localDate: parts[3] ?? "",
      title,
    };
  }
  if (operation === "crea" && representation === "ora" && parts.length === 5) {
    return {
      kind: "events.create",
      representation: "instant",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      title,
    };
  }
  if (
    operation === "modifica" &&
    entityIdPattern.test(parts[2] ?? "") &&
    parts[3]?.toLowerCase() === "data" &&
    parts.length === 5
  ) {
    return {
      kind: "events.update",
      eventId: parts[2] ?? "",
      representation: "date_only",
      localDate: parts[4] ?? "",
      title,
    };
  }
  if (
    operation === "modifica" &&
    entityIdPattern.test(parts[2] ?? "") &&
    parts[3]?.toLowerCase() === "ora" &&
    parts.length === 6
  ) {
    return {
      kind: "events.update",
      eventId: parts[2] ?? "",
      representation: "instant",
      startLocal: parts[4] ?? "",
      endLocal: parts[5] ?? "",
      title,
    };
  }
  return { kind: "events.invalid" };
}

function parseDayView(
  text: string,
  kind: "events.today" | "events.tomorrow",
): EventCommand | UnsupportedCommand {
  return commandParts(text).length === 1 ? { kind } : unsupported;
}

export const eventCommandRoutes: readonly CommandRoute<
  EventCommand | UnsupportedCommand
>[] = [
  ["/evento", parseEventCommand],
  ["/oggi", (text) => parseDayView(text, "events.today")],
  ["/domani", (text) => parseDayView(text, "events.tomorrow")],
];

export const eventCommandKinds = [
  "events.create",
  "events.read",
  "events.update",
  "events.cancel",
  "events.today",
  "events.tomorrow",
  "events.invalid",
] as const;

export const isEventCommand = commandKindGuard<EventCommand>(eventCommandKinds);
