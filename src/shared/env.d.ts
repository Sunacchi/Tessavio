/**
 * Secret opzionali della Phase C. Non stanno in `wrangler.jsonc` sotto
 * `secrets.required` perché `NO_AI` è un percorso di prima classe: senza AI il
 * Worker deve partire senza chiedere una KEK. Qui il tipo dice la verità —
 * possono mancare.
 */
declare global {
  interface Env {
    readonly AI_KEK?: string;
    readonly AI_KEK_VERSION?: string;
    readonly AI_KEK_PREVIOUS?: string;
    readonly AI_KEK_PREVIOUS_VERSION?: string;
  }
}

export {};
