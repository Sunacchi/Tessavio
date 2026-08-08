export const supportedLanguages = ["it"] as const;
export const supportedHourFormats = ["12h", "24h"] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number];
export type HourFormat = (typeof supportedHourFormats)[number];

export interface PreferenceProfile {
  readonly language: SupportedLanguage;
  readonly timeZone: string;
  readonly hourFormat: HourFormat;
  readonly defaultCurrency: string;
  readonly version: number;
}

export interface PreferenceValues {
  readonly language: SupportedLanguage;
  readonly timeZone: string;
  readonly hourFormat: HourFormat;
  readonly defaultCurrency: string;
}

export type PreferenceValidationIssue =
  "language" | "time_zone" | "hour_format" | "currency";

export type PreferenceValidationResult =
  | { readonly ok: true; readonly value: PreferenceValues }
  | { readonly ok: false; readonly issue: PreferenceValidationIssue };

export const preferenceUndoTtlMs = 15 * 60 * 1_000;

export function validatePreferenceValues(input: {
  readonly language: string;
  readonly timeZone: string;
  readonly hourFormat: string;
  readonly defaultCurrency: string;
}): PreferenceValidationResult {
  const language = input.language.trim().toLowerCase();
  if (!supportedLanguages.includes(language as SupportedLanguage)) {
    return { ok: false, issue: "language" };
  }

  const timeZone = canonicalizeTimeZone(input.timeZone);
  if (timeZone === null) {
    return { ok: false, issue: "time_zone" };
  }

  const hourFormat = input.hourFormat.trim().toLowerCase();
  if (!supportedHourFormats.includes(hourFormat as HourFormat)) {
    return { ok: false, issue: "hour_format" };
  }

  const defaultCurrency = input.defaultCurrency.trim().toUpperCase();
  if (!Intl.supportedValuesOf("currency").includes(defaultCurrency)) {
    return { ok: false, issue: "currency" };
  }

  return {
    ok: true,
    value: {
      language: language as SupportedLanguage,
      timeZone,
      hourFormat: hourFormat as HourFormat,
      defaultCurrency,
    },
  };
}

export function canonicalizeTimeZone(value: string): string | null {
  const candidate = value.trim();
  if (candidate.length === 0 || /^[+-]\d{2}:?\d{2}$/u.test(candidate)) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: candidate,
    }).resolvedOptions().timeZone;
  } catch (error) {
    if (error instanceof RangeError) {
      return null;
    }
    throw error;
  }
}
