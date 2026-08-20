export type UserId = string;

export interface UserScope {
  readonly userId: UserId;
}

/**
 * Origine del dato persistito: inserito da un comando esplicito oppure
 * estratto da una proposta AI. La Definition of Done richiede che i due casi
 * siano distinguibili; è un campo, non un'inferenza.
 */
export type EntityProvenance = "entered" | "extracted";

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export const cryptoIdGenerator: IdGenerator = {
  newId: () => crypto.randomUUID(),
};
