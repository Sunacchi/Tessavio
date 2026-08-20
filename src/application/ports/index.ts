/**
 * Re-export di compatibilità: le porte vivono per slice in questa directory e
 * qui non si aggiungono nuove definizioni (ADR-0022). Un modulo nuovo importa
 * `./ports/<slice>`, non questo barrel.
 */
export type * from "./delivery";
export type * from "./effects";
export type * from "./events";
export type * from "./finance";
export type * from "./identity";
export type * from "./inbound";
export type * from "./lists";
export type * from "./preferences";
export type * from "./recurrences";
export type * from "./reminders";
export type * from "./tasks";
export type * from "./telegram";
export type * from "./work";
