import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDeck, createGame, startDeal } from "@belote/game-engine";
import { RoomService } from "../src/room.js";
import { SQLiteSessionRepository } from "../src/sqlite.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function database() {
  const directory = mkdtempSync(join(tmpdir(), "belote-"));
  directories.push(directory);
  return {
    path: join(directory, "sessions.sqlite"),
    repository: new SQLiteSessionRepository(join(directory, "sessions.sqlite")),
  };
}

describe("SQLite restoration", () => {
  it("restores a lobby, participants, teams and token hashes", async () => {
    const { path, repository } = database();
    const rooms = new RoomService();
    const owner = rooms.create("Alice");
    const bob = rooms.join(owner.room.code, "Bob");
    const room = rooms.assign(
      owner.room.code,
      owner.participant.id,
      bob.participant.id,
      1,
      "B",
    );
    await repository.save({ room, game: null, version: 2, processed: [] }, 0);
    repository.close();
    const restoredRepository = new SQLiteSessionRepository(path);
    const restored = restoredRepository.list()[0];
    expect(restored?.room.code).toBe(room.code);
    expect(restored?.room.participants[1]?.tokenHash).toBe(
      bob.participant.tokenHash,
    );
    restoredRepository.close();
  });
  it("preserves an in-progress GameState without redistributing cards", async () => {
    const { repository } = database();
    const game = startDeal(createGame(0), createDeck()).state;
    const room = new RoomService().create("Alice").room;
    await repository.save({ room, game, version: 7, processed: ["cmd-1"] }, 0);
    const loaded = await repository.get(room.id);
    expect(loaded?.version).toBe(7);
    expect(loaded?.processed).toEqual(["cmd-1"]);
    expect(loaded?.game?.deal?.hands).toEqual(game.deal?.hands);
    repository.close();
  });
});
