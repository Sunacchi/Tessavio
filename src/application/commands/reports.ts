import { commandParts, type CommandRoute } from "./shared";

export type ReportCommand =
  | {
      readonly kind: "reports.summary";
      readonly startDate: string;
      readonly endDate: string;
    }
  | {
      readonly kind: "reports.csv";
      readonly startDate: string;
      readonly endDate: string;
    }
  | { readonly kind: "reports.invalid" };

export function parseReportCommand(text: string): ReportCommand {
  const parts = commandParts(text);
  if (parts[1]?.toLowerCase() === "csv" && parts.length === 4) {
    return {
      kind: "reports.csv",
      startDate: parts[2] ?? "",
      endDate: parts[3] ?? "",
    };
  }
  if (parts[1]?.toLowerCase() !== "csv" && parts.length === 3) {
    return {
      kind: "reports.summary",
      startDate: parts[1] ?? "",
      endDate: parts[2] ?? "",
    };
  }
  return { kind: "reports.invalid" };
}

export const reportCommandRoutes: readonly CommandRoute<ReportCommand>[] = [
  ["/report", parseReportCommand],
];
