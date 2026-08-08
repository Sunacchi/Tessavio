export interface StartResult {
  readonly text: string;
}

export function startOnboarding(): StartResult {
  return {
    text: [
      "Ciao, sono Tessavio.",
      "Il nucleo deterministico è attivo e funziona senza AI.",
      "Per ora puoi usare /start; non inviare chiavi API o dati sensibili in chat.",
      "Audio e immagini non sono ancora elaborati in questa fase.",
    ].join("\n"),
  };
}
