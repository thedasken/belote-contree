import { describe, expect, it } from "vitest";
import { createDeck, createGame, startDeal } from "@belote/game-engine";
import {
  MemorySessionRepository,
  SessionService,
  type SessionSnapshot,
} from "../src/session.js";
import { RoomService } from "../src/room.js";

function snapshot(): {
  value: SessionSnapshot;
  participant: ReturnType<RoomService["create"]>["participant"];
} {
  const rooms = new RoomService();
  const created = rooms.create("Alice");
  const game = startDeal(createGame(3), createDeck()).state;
  return {
    value: { room: created.room, game, version: 0, processed: [] },
    participant: created.participant,
  };
}
describe("Session suspension", () => {
  it("rejects game commands while suspended and preserves the engine state", async () => {
    const base = snapshot();
    const repository = new MemorySessionRepository();
    await repository.save(base.value, 0);
    const service = new SessionService(repository, {
      sendToPlayer: async () => {},
      broadcastPublic: async () => {},
    });
    const paused = await service.setSuspended(base.value, true);
    expect(paused.suspended).toBe(true);
    const before = await repository.get(base.value.room.id);
    await expect(
      service.command(paused, base.participant, "cmd-1", paused.version, {
        type: "PLACE_BID",
        seat: 0,
        value: 80,
        trumpSuit: "HEARTS",
      }),
    ).rejects.toThrow("SESSION_PAUSED");
    expect(await repository.get(base.value.room.id)).toEqual(before);
  });
  it("does not acknowledge a command when persistence fails", async () => {
    const base = snapshot();
    const repository = {
      get: async () => base.value,
      save: async () => {
        throw new Error("DB_DOWN");
      },
      delete: async () => {},
    };
    const service = new SessionService(repository, {
      sendToPlayer: async () => {},
      broadcastPublic: async () => {},
    });
    await expect(
      service.command(base.value, base.participant, "cmd-1", 0, {
        type: "PLACE_BID",
        seat: 0,
        value: 80,
        trumpSuit: "HEARTS",
      }),
    ).rejects.toThrow("DB_DOWN");
  });
});
