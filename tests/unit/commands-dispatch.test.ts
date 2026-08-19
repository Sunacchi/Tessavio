import { describe, expect, it } from "vitest";
import {
  parseDeterministicCommand,
  registeredCommandKeywords,
} from "../../src/application/deterministic-command";

describe("C0.1 command dispatch", () => {
  it("registra ogni parola di comando una sola volta", () => {
    expect(new Set(registeredCommandKeywords).size).toBe(
      registeredCommandKeywords.length,
    );
    expect(registeredCommandKeywords).toContain("/evento");
    expect(registeredCommandKeywords).toContain("/annulla");
  });

  it("instrada la parola di comando al dominio proprietario", () => {
    expect(parseDeterministicCommand("/task lista").kind).toBe("tasks.list");
    expect(parseDeterministicCommand("/liste lista").kind).toBe("lists.list");
    expect(parseDeterministicCommand("/note lista").kind).toBe("notes.list");
    expect(parseDeterministicCommand("/promemoria lista").kind).toBe(
      "reminders.list",
    );
  });

  it("normalizza spazi e maiuscole della parola di comando", () => {
    expect(parseDeterministicCommand("  /OGGI  ").kind).toBe("events.today");
  });

  it("risponde unsupported a un comando sconosciuto o a testo libero", () => {
    expect(parseDeterministicCommand("/sconosciuto").kind).toBe("unsupported");
    expect(
      parseDeterministicCommand("ricordami di comprare il latte").kind,
    ).toBe("unsupported");
    expect(parseDeterministicCommand("").kind).toBe("unsupported");
  });
});
