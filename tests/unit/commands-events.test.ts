import { describe, expect, it } from "vitest";
import {
  eventCommandRoutes,
  parseEventCommand,
} from "../../src/application/commands/events";
import { parseDeterministicCommand } from "../../src/application/deterministic-command";

describe("C0.1 event command parser", () => {
  it("parses the create, read, update and cancel shapes", () => {
    expect(
      parseEventCommand("/evento crea data 2026-08-20 | Dentista"),
    ).toEqual({
      kind: "events.create",
      representation: "date_only",
      localDate: "2026-08-20",
      title: " Dentista",
    });
    expect(
      parseEventCommand(
        "/evento crea ora 2026-08-20T10:00 2026-08-20T11:00 | Riunione",
      ),
    ).toEqual({
      kind: "events.create",
      representation: "instant",
      startLocal: "2026-08-20T10:00",
      endLocal: "2026-08-20T11:00",
      title: " Riunione",
    });
    expect(parseEventCommand("/evento leggi evt-1")).toEqual({
      kind: "events.read",
      eventId: "evt-1",
    });
    expect(parseEventCommand("/evento annulla evt-1")).toEqual({
      kind: "events.cancel",
      eventId: "evt-1",
    });
    expect(parseEventCommand("/evento crea data 2026-08-20")).toEqual({
      kind: "events.invalid",
    });
  });

  it("registers /evento, /oggi e /domani e rifiuta argomenti sulle viste", () => {
    expect(eventCommandRoutes.map(([keyword]) => keyword)).toEqual([
      "/evento",
      "/oggi",
      "/domani",
    ]);
    expect(parseDeterministicCommand("/oggi")).toEqual({
      kind: "events.today",
    });
    expect(parseDeterministicCommand("/domani")).toEqual({
      kind: "events.tomorrow",
    });
    expect(parseDeterministicCommand("/oggi extra")).toEqual({
      kind: "unsupported",
    });
  });
});
