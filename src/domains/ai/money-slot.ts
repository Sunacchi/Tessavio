/**
 * Risoluzione deterministica del testo monetario prodotto dal modello.
 * Il modello scrive `"12,50 euro"`; qui, e solo qui, quel testo diventa un
 * intero in unità minori. Invariante 8: nessun `float` attraversa il dominio.
 */
export interface ResolvedMoneySlot {
  /** Unità minori intere, come stringa: è la forma attesa dal comando B5. */
  readonly amountMinor: string;
  readonly currency: string;
  /** `true` quando la valuta viene dal default dell'utente, non dal testo. */
  readonly currencyFromDefault: boolean;
}

export type MoneySlotIssue = "unparsable" | "out_of_range" | "currency";

export type MoneySlotResult =
  | { readonly ok: true; readonly value: ResolvedMoneySlot }
  | { readonly ok: false; readonly issue: MoneySlotIssue };

/** Le valute supportate hanno tutte due decimali: il resto è un rifiuto. */
const currencyMarkers: readonly (readonly [RegExp, string])[] = [
  [/€|\beuro\b|\beuri\b|\beur\b/iu, "EUR"],
  [/\$|\bdollar[oi]\b|\busd\b/iu, "USD"],
  [/£|\bsterlin[ae]\b|\bgbp\b/iu, "GBP"],
];

const minorUnitDigits = 2;
const maximumAmountMinor = 2_147_483_647;
const amountPattern = /(\d[\d.,\s]*\d|\d)/u;

function detectCurrency(text: string): string | null {
  for (const [pattern, code] of currencyMarkers) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/**
 * Separatori italiani e inglesi convivono nello stesso messaggio: decide
 * l'ultimo separatore, e un gruppo di tre cifre resta migliaia.
 */
function parseAmountMinor(raw: string): number | null {
  const cleaned = raw.replace(/\s/gu, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);

  let integerPart = cleaned;
  let decimalPart = "";
  if (decimalIndex !== -1) {
    const candidate = cleaned.slice(decimalIndex + 1);
    if (/^\d{1,2}$/u.test(candidate)) {
      integerPart = cleaned.slice(0, decimalIndex);
      decimalPart = candidate;
    } else if (!/^\d{3}$/u.test(candidate)) {
      return null;
    }
  }
  const digits = integerPart.replace(/[.,]/gu, "");
  if (!/^\d+$/u.test(digits)) return null;
  const padded = decimalPart.padEnd(minorUnitDigits, "0");
  const minor = Number(`${digits}${padded}`);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function resolveMoneySlot(
  rawText: string,
  context: { readonly defaultCurrency: string },
): MoneySlotResult {
  const text = rawText.trim();
  if (text.length === 0) return { ok: false, issue: "unparsable" };

  const match = amountPattern.exec(text.replace(/[€$£]/gu, " "));
  if (match === null) return { ok: false, issue: "unparsable" };
  const amountMinor = parseAmountMinor(match[0]);
  if (amountMinor === null) return { ok: false, issue: "unparsable" };
  if (amountMinor < 1 || amountMinor > maximumAmountMinor) {
    return { ok: false, issue: "out_of_range" };
  }

  const detected = detectCurrency(text);
  const currency = (detected ?? context.defaultCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) return { ok: false, issue: "currency" };
  return {
    ok: true,
    value: {
      amountMinor: String(amountMinor),
      currency,
      currencyFromDefault: detected === null,
    },
  };
}
