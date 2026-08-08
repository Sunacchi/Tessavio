export type UserId = string;

export interface UserScope {
  readonly userId: UserId;
}

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
