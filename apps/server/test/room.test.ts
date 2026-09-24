import { describe, expect, it } from "vitest";
import { RoomError, RoomService } from "../src/room.js";
import { buildServer } from "../src/main.js";

describe("Room", () => {
  it("creates unique private rooms and authenticates only with the private token", () => {
    const service = new RoomService();
    const first = service.create(" Alice ");
    const second = service.create("Bob");
    expect(first.room.code).not.toBe(second.room.code);
    expect(first.room.participants[0]?.nickname).toBe("Alice");
    expect(service.authenticate(first.room.code, first.token).id).toBe(
      first.participant.id,
    );
    expect(() =>
      service.authenticate(first.room.code, first.room.code),
    ).toThrow(RoomError);
    expect(service.public(first.room)).not.toHaveProperty(
      "participants.0.tokenHash",
    );
  });
  it("allows at most four participants and owner-only start", () => {
    const service = new RoomService();
    const owner = service.create("A");
    service.join(owner.room.code, "B");
    service.join(owner.room.code, "C");
    service.join(owner.room.code, "D");
    expect(() => service.join(owner.room.code, "E")).toThrow(RoomError);
    expect(() => service.start(owner.room.code, "other")).toThrow(RoomError);
    expect(service.start(owner.room.code, owner.participant.id).phase).toBe(
      "PLAYING",
    );
  });
});

describe("HTTP", () => {
  it("n'expose pas la fixture E2E sans activation explicite", async () => {
    const previous = process.env.E2E_FIXTURE;
    delete process.env.E2E_FIXTURE;
    const app = buildServer();
    const response = await app.inject({
      method: "POST",
      url: "/__test/fixture",
      payload: { game: {} },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
    if (previous === undefined) delete process.env.E2E_FIXTURE;
    else process.env.E2E_FIXTURE = previous;
  });

  it("exposes health and validates room creation", async () => {
    const app = buildServer();
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true });
    const invalid = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { nickname: "" },
    });
    expect(invalid.statusCode).toBe(400);
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { nickname: "Alice" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().token).toBeTypeOf("string");
    await app.close();
  });
});
