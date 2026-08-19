import { commandParts, entityIdPattern, type CommandRoute } from "./shared";

export type WorkCommand =
  | {
      readonly kind: "work.rule.create";
      readonly breakTreatment: string;
      readonly name: string;
    }
  | { readonly kind: "work.rule.read"; readonly ruleId: string }
  | { readonly kind: "work.rule.list" }
  | {
      readonly kind: "work.shift.create";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly title: string;
    }
  | { readonly kind: "work.shift.read"; readonly shiftId: string }
  | {
      readonly kind: "work.log.create";
      readonly startLocal: string;
      readonly endLocal: string;
      readonly ruleId: string;
      readonly title: string;
    }
  | { readonly kind: "work.log.read"; readonly workLogId: string }
  | {
      readonly kind: "work.break.create";
      readonly workLogId: string;
      readonly startLocal: string;
      readonly endLocal: string;
    }
  | { readonly kind: "work.break.read"; readonly workBreakId: string }
  | { readonly kind: "work.day"; readonly localDate: string }
  | {
      readonly kind: "work.report";
      readonly startDate: string;
      readonly endDate: string;
    }
  | { readonly kind: "work.invalid" };

export function parseWorkCommand(text: string): WorkCommand {
  const separatorIndex = text.indexOf("|");
  const commandText =
    separatorIndex === -1 ? text : text.slice(0, separatorIndex).trim();
  const label = separatorIndex === -1 ? null : text.slice(separatorIndex + 1);
  const parts = commandParts(commandText);
  const section = parts[1]?.toLowerCase();
  const operation = parts[2]?.toLowerCase();

  if (
    section === "regola" &&
    operation === "crea" &&
    parts.length === 4 &&
    label !== null
  ) {
    return {
      kind: "work.rule.create",
      breakTreatment:
        parts[3]?.toLowerCase() === "retribuita"
          ? "paid"
          : parts[3]?.toLowerCase() === "non_retribuita"
            ? "unpaid"
            : (parts[3] ?? ""),
      name: label,
    };
  }
  if (
    section === "regola" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.rule.read", ruleId: parts[3] ?? "" };
  }
  if (section === "regole" && parts.length === 2 && label === null) {
    return { kind: "work.rule.list" };
  }
  if (
    section === "regola" &&
    operation === "lista" &&
    parts.length === 3 &&
    label === null
  ) {
    return { kind: "work.rule.list" };
  }
  if (
    section === "turno" &&
    operation === "crea" &&
    parts.length === 5 &&
    label !== null
  ) {
    return {
      kind: "work.shift.create",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      title: label,
    };
  }
  if (
    section === "turno" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.shift.read", shiftId: parts[3] ?? "" };
  }
  if (
    section === "consuntivo" &&
    operation === "crea" &&
    parts.length === 6 &&
    entityIdPattern.test(parts[5] ?? "") &&
    label !== null
  ) {
    return {
      kind: "work.log.create",
      startLocal: parts[3] ?? "",
      endLocal: parts[4] ?? "",
      ruleId: parts[5] ?? "",
      title: label,
    };
  }
  if (
    section === "consuntivo" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.log.read", workLogId: parts[3] ?? "" };
  }
  if (
    section === "pausa" &&
    operation === "crea" &&
    parts.length === 6 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return {
      kind: "work.break.create",
      workLogId: parts[3] ?? "",
      startLocal: parts[4] ?? "",
      endLocal: parts[5] ?? "",
    };
  }
  if (
    section === "pausa" &&
    operation === "leggi" &&
    parts.length === 4 &&
    entityIdPattern.test(parts[3] ?? "") &&
    label === null
  ) {
    return { kind: "work.break.read", workBreakId: parts[3] ?? "" };
  }
  if (section === "giorno" && parts.length === 3 && label === null) {
    return { kind: "work.day", localDate: parts[2] ?? "" };
  }
  if (section === "report" && parts.length === 4 && label === null) {
    return {
      kind: "work.report",
      startDate: parts[2] ?? "",
      endDate: parts[3] ?? "",
    };
  }
  return { kind: "work.invalid" };
}

export const workCommandRoutes: readonly CommandRoute<WorkCommand>[] = [
  ["/lavoro", parseWorkCommand],
];
