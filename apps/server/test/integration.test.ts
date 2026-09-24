import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  cardForce,
  cardPoints,
  type Card,
  type Suit,
} from "@belote/game-engine";
import { buildServer } from "../src/main.js";
type Message = Record<string, unknown>;
type View = {
  phase: string;
  seat: number;
  hand: Card[];
  scores: { A: number; B: number };
  activeSeat: number | null;
  publicTricks: Array<{
    index: number;
    leader: number;
    cards: Array<{ seat: number; card: Card }>;
    winner: number | null;
    points: number;
  }>;
  contract: { bid: { trumpSuit: Suit } } | null;
};
class Client {
  readonly messages: Message[] = [];
  private readonly waiters: Array<{
    type: string;
    resolve: (message: Message) => void;
  }> = [];
  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as Message;
      const waiter = this.waiters.find(
        (candidate) => candidate.type === message.type,
      );
      if (waiter) {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    });
  }
  wait(type: string, timeout = 2000): Promise<Message> {
    const index = this.messages.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(this.messages.splice(index, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for " + type)),
        timeout,
      );
      this.waiters.push({
        type,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }
  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }
  close(): void {
    this.socket.close();
  }
}
const tempDirs: string[] = [];
afterEach(() => {
  delete process.env.WS_HEARTBEAT_INTERVAL_MS;
  delete process.env.WS_HEARTBEAT_TIMEOUT_MS;
  for (const directory of tempDirs.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
async function openClient(
  url: string,
  token: string,
  options: { autoPong?: boolean } = {},
): Promise<Client> {
  const socket = new WebSocket(url, { autoPong: options.autoPong ?? true });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  const client = new Client(socket);
  client.send({ type: "AUTH", token });
  await client.wait("ROOM_STATE");
  return client;
}
async function setup(
  options: { silentSeat?: number; heartbeat?: boolean } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "belote-integration-"));
  tempDirs.push(directory);
  const databasePath = join(directory, "sessions.sqlite");
  process.env.DATABASE_PATH = databasePath;
  if (options.heartbeat) {
    process.env.WS_HEARTBEAT_INTERVAL_MS = "20";
    process.env.WS_HEARTBEAT_TIMEOUT_MS = "60";
  }
  const app = buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (!address || typeof address === "string")
    throw new Error("No server address");
  const base = "http://127.0.0.1:" + address.port;
  const create = await app.inject({
    method: "POST",
    url: "/rooms",
    payload: { nickname: "P0" },
  });
  const owner = create.json();
  const players = [owner];
  for (const nickname of ["P1", "P2", "P3"])
    players.push(
      (
        await app.inject({
          method: "POST",
          url: "/rooms/" + owner.code + "/join",
          payload: { nickname },
        })
      ).json(),
    );
  await app.inject({
    method: "POST",
    url: "/rooms/" + owner.code + "/start",
    payload: { token: owner.token },
  });
  const clients = await Promise.all(
    players.map((player, index) =>
      openClient(
        base.replace("http", "ws") + "/rooms/" + owner.code + "/ws",
        player.token,
        { autoPong: options.silentSeat !== index },
      ),
    ),
  );
  return {
    app,
    owner,
    players,
    clients,
    code: owner.code,
    port: address.port,
    databasePath,
  };
}
async function closeClient(client: Client): Promise<void> {
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    client.socket.once("close", () => resolve());
    client.close();
  });
}
function legalCard(view: View): Card {
  const hand = view.hand;
  const current = view.publicTricks.at(-1);
  if (!current) return hand[0]!;
  if (current.cards.length === 0) return hand[0]!;
  const lead = current.cards[0]!.card.suit;
  const trump = view.contract!.bid.trumpSuit;
  const following = hand.filter((card) => card.suit === lead);
  if (following.length > 0) {
    if (lead !== trump) return following[0]!;
    const best = Math.max(
      ...current.cards
        .filter(({ card }) => card.suit === trump)
        .map(({ card }) => cardForce(card, trump)),
    );
    return (
      following.find((card) => cardForce(card, trump) > best) ?? following[0]!
    );
  }
  const winner = current.cards.reduce(
    (best, played) => {
      if (!best) return played;
      if (played.card.suit === trump && best.card.suit !== trump) return played;
      if (played.card.suit !== trump && best.card.suit === trump) return best;
      return cardForce(played.card, trump) > cardForce(best.card, trump)
        ? played
        : best;
    },
    null as { seat: number; card: Card } | null,
  )!;
  if (winner.seat % 2 === view.seat % 2) return hand[0]!;
  const trumps = hand.filter((card) => card.suit === trump);
  if (trumps.length === 0) return hand[0]!;
  if (winner.card.suit !== trump) return trumps[0]!;
  return (
    trumps.find(
      (card) => cardForce(card, trump) > cardForce(winner.card, trump),
    ) ?? hand[0]!
  );
}
describe("WebSocket integration réelle", () => {
  it("connecte quatre clients, exécute les enchères et un pli légal", async () => {
    const context = await setup();
    const { clients, app } = context;
    const initial = await Promise.all(
      clients.map((client) => client.wait("GAME_STATE")),
    );
    const hands = initial.map(
      (message) =>
        (message.state as { hand: Array<{ suit: string; rank: string }> }).hand,
    );
    expect(
      new Set(hands.flat().map((card) => card.suit + card.rank)).size,
    ).toBe(32);
    expect(
      initial.every(
        (message) => !JSON.stringify(message).includes("tokenHash"),
      ),
    ).toBe(true);
    let version = Number(initial[0]!.version);
    const send = async (client: Client, seat: number, command: Message) => {
      client.send({
        type: "GAME_COMMAND",
        commandId: "cmd-" + seat + "-" + version,
        expectedVersion: version,
        command,
      });
      await client.wait("COMMAND_ACK");
      version++;
    };
    await send(clients[1]!, 1, {
      type: "PLACE_BID",
      seat: 1,
      value: 80,
      trumpSuit: "HEARTS",
    });
    await send(clients[2]!, 2, { type: "PASS", seat: 2 });
    await send(clients[3]!, 3, { type: "PASS", seat: 3 });
    await send(clients[0]!, 0, { type: "PASS", seat: 0 });
    const playing = await Promise.all(
      clients.map((client) => client.wait("GAME_STATE")),
    );
    const state1 = playing[1]!.state as {
      hand: Array<{ suit: string; rank: string }>;
    };
    const lead = state1.hand[0]!;
    await send(clients[1]!, 1, { type: "PLAY_CARD", seat: 1, card: lead });
    for (const seat of [2, 3, 0]) {
      const view = (await clients[seat]!.wait("GAME_STATE")).state as {
        hand: Array<{ suit: string; rank: string }>;
        publicTricks: Array<{ cards: Array<{ card: { suit: string } }> }>;
      };
      const suit = view.publicTricks.at(-1)?.cards[0]?.card.suit;
      const card =
        view.hand.find((candidate) => candidate.suit === suit) ??
        view.hand.find((candidate) => candidate.suit !== "HEARTS") ??
        view.hand[0]!;
      await send(clients[seat]!, seat, { type: "PLAY_CARD", seat, card });
    }
    expect(
      clients.every((client) =>
        client.messages.some((message) => message.type === "GAME_STATE"),
      ),
    ).toBe(true);
    clients.forEach((client) => client.close());
    await app.close();
  });
  it("joue une donne complète de huit plis avec quatre clients", async () => {
    const context = await setup();
    const { clients, app } = context;
    const initial = await Promise.all(
      clients.map((client) => client.wait("GAME_STATE")),
    );
    const hands = initial.map((message) => (message.state as View).hand);
    expect(
      new Set(hands.flat().map((card) => card.suit + card.rank)).size,
    ).toBe(32);
    let version = Number(initial[0]!.version);
    let commandNumber = 0;
    const send = async (seat: number, command: Message) => {
      const client = clients[seat]!;
      client.send({
        type: "GAME_COMMAND",
        commandId: "full-deal-" + commandNumber++,
        expectedVersion: version,
        command,
      });
      const ack = await client.wait("COMMAND_ACK");
      version = Number(ack.version);
      const states = await Promise.all(
        clients.map(
          async (target) => (await target.wait("GAME_STATE")).state as View,
        ),
      );
      expect(new Set(states.map((state) => state.activeSeat)).size).toBe(1);
      expect(new Set(states.map((state) => state.phase)).size).toBe(1);
      return states;
    };
    await send(1, {
      type: "PLACE_BID",
      seat: 1,
      value: 80,
      trumpSuit: "HEARTS",
    });
    await send(2, { type: "PASS", seat: 2 });
    await send(3, { type: "PASS", seat: 3 });
    let states = await send(0, { type: "PASS", seat: 0 });
    const played = new Set<string>();
    for (let cardNumber = 0; cardNumber < 32; cardNumber++) {
      const active = states[0]!.activeSeat;
      expect(active).not.toBeNull();
      const seat = active!;
      const card = legalCard(states[seat]!);
      const id = card.suit + ":" + card.rank;
      expect(played.has(id)).toBe(false);
      played.add(id);
      states = await send(seat, { type: "PLAY_CARD", seat, card });
    }
    const final = states[0]!;
    const completed = [
      ...new Map(
        final.publicTricks.map((trick) => [trick.index, trick]),
      ).values(),
    ];
    expect(played.size).toBe(32);
    expect(final.phase).toBe("DEAL_COMPLETED");
    expect(completed).toHaveLength(8);
    expect(completed.every((trick) => trick.cards.length === 4)).toBe(true);
    expect(completed.every((trick) => trick.winner !== null)).toBe(true);
    const rawPoints = completed.reduce(
      (total, trick) =>
        total +
        trick.cards.reduce(
          (points, played) =>
            points + cardPoints(played.card, final.contract!.bid.trumpSuit),
          0,
        ),
      0,
    );
    expect(rawPoints).toBe(152);
    expect(rawPoints + 10).toBe(162);
    expect(completed.at(-1)!.points).toBeGreaterThan(
      completed
        .at(-1)!
        .cards.reduce(
          (points, played) =>
            points + cardPoints(played.card, final.contract!.bid.trumpSuit),
          0,
        ),
    );
    expect(final.hand).toHaveLength(0);
    expect(final.scores.A + final.scores.B).toBeGreaterThan(0);
    clients.forEach((client) => client.close());
    await app.close();
  });
  it("restaure une partie après redémarrage et déduplique une commande", async () => {
    const first = await setup();
    const initial = await Promise.all(
      first.clients.map((client) => client.wait("GAME_STATE")),
    );
    let version = Number(initial[0]!.version);
    let commandNumber = 0;
    const send = async (seat: number, command: Message, id?: string) => {
      const commandId = id ?? "restart-" + commandNumber++;
      first.clients[seat]!.send({
        type: "GAME_COMMAND",
        commandId,
        expectedVersion: version,
        command,
      });
      const ack = await first.clients[seat]!.wait("COMMAND_ACK");
      version = Number(ack.version);
      const states = await Promise.all(
        first.clients.map(
          async (client) => (await client.wait("GAME_STATE")).state as View,
        ),
      );
      expect(new Set(states.map((state) => state.activeSeat)).size).toBe(1);
      return { commandId, expectedVersion: Number(ack.version) - 1, states };
    };
    await send(1, {
      type: "PLACE_BID",
      seat: 1,
      value: 80,
      trumpSuit: "HEARTS",
    });
    await send(2, { type: "PASS", seat: 2 });
    await send(3, { type: "PASS", seat: 3 });
    let states = (await send(0, { type: "PASS", seat: 0 })).states;
    let lastCommand: {
      seat: number;
      commandId: string;
      expectedVersion: number;
      command: Message;
    } | null = null;
    for (let cardNumber = 0; cardNumber < 5; cardNumber++) {
      const seat = states[0]!.activeSeat!;
      const card = legalCard(states[seat]!);
      const command = { type: "PLAY_CARD", seat, card };
      const result = await send(seat, command);
      states = result.states;
      if (cardNumber === 4)
        lastCommand = {
          seat,
          commandId: result.commandId,
          expectedVersion: result.expectedVersion,
          command,
        };
    }
    const reference = states[0]!;
    const referenceVersion = version;
    await Promise.all(first.clients.map(closeClient));
    await first.app.close();

    const second = buildServer();
    await second.listen({ port: 0, host: "127.0.0.1" });
    const address = second.server.address();
    if (!address || typeof address === "string")
      throw new Error("No server address");
    const room = await second.inject({
      method: "GET",
      url: "/rooms/" + first.code,
    });
    expect(room.statusCode).toBe(200);
    expect(room.json().participants).toHaveLength(4);
    expect(
      room
        .json()
        .participants.map((participant: { team: string }) => participant.team),
    ).toEqual(["A", "B", "A", "B"]);
    const restoredClients = await Promise.all(
      first.players.map((player) =>
        openClient(
          "ws://127.0.0.1:" + address.port + "/rooms/" + first.code + "/ws",
          player.token,
        ),
      ),
    );
    await Promise.all(
      restoredClients.map((client) => client.wait("SESSION_RESUMED")),
    );
    let restoredMessages = await Promise.all(
      restoredClients.map((client) => client.wait("GAME_STATE")),
    );
    const restoredVersion = Math.max(
      ...restoredMessages.map((message) => Number(message.version)),
    );
    restoredMessages = await Promise.all(
      restoredMessages.map(async (message, index) => {
        if (Number(message.version) === restoredVersion) return message;
        return restoredClients[index]!.wait("GAME_STATE");
      }),
    );
    const restored = restoredMessages.map((message) => message.state as View);
    expect(restored.map((state) => state.hand)).toEqual(
      states.map((state) => state.hand),
    );
    expect(restored[0]!.publicTricks).toEqual(reference.publicTricks);
    expect(restored[0]!.contract).toEqual(reference.contract);
    expect(restored[0]!.activeSeat).toBe(reference.activeSeat);
    expect(Number(restoredMessages[0]!.version)).toBeGreaterThan(
      referenceVersion,
    );
    expect(
      restored.every((state) => !JSON.stringify(state).includes("tokenHash")),
    ).toBe(true);
    expect(lastCommand).not.toBeNull();
    restoredClients[lastCommand!.seat]!.send({
      type: "GAME_COMMAND",
      commandId: lastCommand!.commandId,
      expectedVersion: lastCommand!.expectedVersion,
      command: lastCommand!.command,
    });
    const duplicate =
      await restoredClients[lastCommand!.seat]!.wait("COMMAND_REJECTED");
    expect(duplicate.code).toBe("DUPLICATE_COMMAND");
    const seat = restored[0]!.activeSeat!;
    const nextCard = legalCard(restored[seat]!);
    restoredClients[seat]!.send({
      type: "GAME_COMMAND",
      commandId: "restart-next",
      expectedVersion: Number(restoredMessages[0]!.version),
      command: { type: "PLAY_CARD", seat, card: nextCard },
    });
    const continuation = await Promise.race([
      restoredClients[seat]!.wait("COMMAND_ACK"),
      restoredClients[seat]!.wait("COMMAND_REJECTED"),
    ]);
    expect(continuation.type, JSON.stringify(continuation)).toBe("COMMAND_ACK");
    await Promise.all(
      restoredClients.map((client) => client.wait("GAME_STATE")),
    );
    await Promise.all(restoredClients.map(closeClient));
    await second.close();
  });
  it("remplace une connexion et rejette un jeton invalide", async () => {
    const context = await setup();
    const second = await openClient(
      "ws://127.0.0.1:" + context.port + "/rooms/" + context.code + "/ws",
      context.players[0]!.token,
    );
    expect(second.socket.readyState).toBe(WebSocket.OPEN);
    const invalidSocket = new WebSocket(
      "ws://127.0.0.1:" + context.port + "/rooms/" + context.code + "/ws",
    );
    const invalid = await new Promise<Message>((resolve) => {
      invalidSocket.once("open", () =>
        invalidSocket.send(
          JSON.stringify({ type: "AUTH", token: "x".repeat(32) }),
        ),
      );
      invalidSocket.once("message", (data) =>
        resolve(JSON.parse(data.toString()) as Message),
      );
    });
    expect(invalid.type).toBe("COMMAND_REJECTED");
    invalidSocket.close();
    context.clients.forEach((client) => client.close());
    second.close();
    await context.app.close();
  });

  it("suspend et reprend une session après déconnexion", async () => {
    const context = await setup();
    const disconnected = context.clients[0]!;
    disconnected.close();
    await Promise.all(
      context.clients.slice(1).map((client) => client.wait("SESSION_PAUSED")),
    );
    const reconnect = await openClient(
      "ws://127.0.0.1:" + context.port + "/rooms/" + context.code + "/ws",
      context.players[0]!.token,
    );
    await Promise.all(
      context.clients.slice(1).map((client) => client.wait("SESSION_RESUMED")),
    );
    expect((await reconnect.wait("GAME_STATE")).state).toHaveProperty("hand");
    reconnect.close();
    context.clients.slice(1).forEach((client) => client.close());
    await context.app.close();
  });

  it("rejette les messages malformés et les versions obsolètes", async () => {
    const context = await setup();
    const client = context.clients[0]!;
    client.send({ type: "GAME_COMMAND" });
    expect((await client.wait("COMMAND_REJECTED")).code).toBe(
      "INVALID_MESSAGE",
    );
    client.send({
      type: "GAME_COMMAND",
      commandId: "stale",
      expectedVersion: 0,
      command: { type: "PASS", seat: 0 },
    });
    expect((await client.wait("COMMAND_REJECTED")).code).toBe("STALE_VERSION");
    const forbidden = await context.app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example" },
    });
    expect(forbidden.statusCode).toBe(403);
    context.clients.forEach((client) => client.close());
    await context.app.close();
  });

  it("sérialise deux commandes concurrentes sur une version unique", async () => {
    const context = await setup();
    const version = Number(
      (await context.clients[0]!.wait("GAME_STATE")).version,
    );
    const command = (id: string) => ({
      type: "GAME_COMMAND",
      commandId: id,
      expectedVersion: version,
      command: { type: "PASS", seat: 1 },
    });
    context.clients[1]!.send(command("concurrent-a"));
    context.clients[2]!.send(command("concurrent-b"));
    const responses = await Promise.all([
      context.clients[1]!.wait("COMMAND_ACK"),
      context.clients[2]!.wait("COMMAND_REJECTED"),
    ]);
    expect(responses[0]!.type).toBe("COMMAND_ACK");
    expect(responses[1]!.code).toBe("STALE_VERSION");
    context.clients.forEach((client) => client.close());
    await context.app.close();
  });

  it("accepte un seul contre parmi deux commandes simultanées", async () => {
    const context = await setup();
    const initial = await Promise.all(
      context.clients.map((client) => client.wait("GAME_STATE")),
    );
    let version = Number(initial[0]!.version);
    const bid = {
      type: "GAME_COMMAND",
      commandId: "counter-bid",
      expectedVersion: version,
      command: { type: "PLACE_BID", seat: 1, value: 80, trumpSuit: "HEARTS" },
    };
    context.clients[1]!.send(bid);
    await context.clients[1]!.wait("COMMAND_ACK");
    version++;
    await Promise.all(
      context.clients.map((client) => client.wait("GAME_STATE")),
    );
    const counter = (id: string, seat: number) => ({
      type: "GAME_COMMAND",
      commandId: id,
      expectedVersion: version,
      command: { type: "COINCHE", seat },
    });
    context.clients[0]!.send(counter("counter-a", 0));
    context.clients[2]!.send(counter("counter-b", 2));
    const responses = await Promise.all([
      Promise.race([
        context.clients[0]!.wait("COMMAND_ACK"),
        context.clients[0]!.wait("COMMAND_REJECTED"),
      ]),
      Promise.race([
        context.clients[2]!.wait("COMMAND_ACK"),
        context.clients[2]!.wait("COMMAND_REJECTED"),
      ]),
    ]);
    expect(
      responses.filter((response) => response.type === "COMMAND_ACK"),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.type === "COMMAND_REJECTED"),
    ).toHaveLength(1);
    const states = await Promise.all(
      context.clients.map(
        async (client) => (await client.wait("GAME_STATE")).state as View,
      ),
    );
    expect(new Set(states.map((state) => state.phase))).toEqual(
      new Set(["BIDDING"]),
    );
    context.clients.forEach((client) => client.close());
    await context.app.close();
  });

  it("applique les limites de taille et de débit WebSocket", async () => {
    const context = await setup();
    const client = context.clients[0]!;
    client.socket.send("x".repeat(2 * 1024 * 1024));
    client.close();
    const rateLimited = context.clients[1]!;
    for (let index = 0; index < 140; index++)
      rateLimited.send({ type: "START_GAME" });
    let limited = false;
    for (let index = 0; index < 140; index++) {
      const message = await rateLimited.wait("COMMAND_REJECTED", 5000);
      if (message.code === "RATE_LIMITED") {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    context.clients.forEach((connected) => connected.close());
    await context.app.close();
  });

  it("HB-01 conserve un client sain pendant plusieurs ping/pong", async () => {
    const context = await setup({ heartbeat: true });
    let pings = 0;
    context.clients[0]!.socket.on("ping", () => {
      pings++;
    });
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("heartbeat timeout")),
        500,
      );
      const check = () => {
        if (pings >= 2) {
          clearTimeout(deadline);
          resolve();
        } else setTimeout(check, 10);
      };
      check();
    });
    expect(context.clients[0]!.socket.readyState).toBe(WebSocket.OPEN);
    expect(
      context.clients[1]!.messages.some(
        (message) => message.type === "SESSION_PAUSED",
      ),
    ).toBe(false);
    context.clients.forEach((client) => client.close());
    await context.app.close();
  });

  it("HB-02 expire un client silencieux puis reprend la session", async () => {
    const context = await setup({ heartbeat: true, silentSeat: 0 });
    await Promise.all(
      context.clients
        .slice(1)
        .map((client) => client.wait("SESSION_PAUSED", 1000)),
    );
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("silent client did not close")),
        1000,
      );
      const check = () => {
        if (context.clients[0]!.socket.readyState === WebSocket.CLOSED) {
          clearTimeout(deadline);
          resolve();
        } else setTimeout(check, 10);
      };
      check();
    });
    const reconnect = await openClient(
      "ws://127.0.0.1:" + context.port + "/rooms/" + context.code + "/ws",
      context.players[0]!.token,
    );
    await Promise.all(
      context.clients
        .slice(1)
        .map((client) => client.wait("SESSION_RESUMED", 1000)),
    );
    const restored = await reconnect.wait("GAME_STATE");
    expect((restored.state as View).hand).toHaveLength(8);
    const initial = Number(restored.version);
    context.clients[1]!.send({
      type: "GAME_COMMAND",
      commandId: "heartbeat-resume-pass",
      expectedVersion: initial,
      command: { type: "PASS", seat: 1 },
    });
    await context.clients[1]!.wait("COMMAND_ACK");
    reconnect.close();
    context.clients.slice(1).forEach((client) => client.close());
    await context.app.close();
  });

  it("HB-03 ignore l'expiration tardive d'une connexion remplacée et nettoie", async () => {
    const context = await setup({ heartbeat: true });
    const replacement = await openClient(
      "ws://127.0.0.1:" + context.port + "/rooms/" + context.code + "/ws",
      context.players[0]!.token,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(replacement.socket.readyState).toBe(WebSocket.OPEN);
    expect(
      context.clients
        .slice(1)
        .some((client) =>
          client.messages.some((message) => message.type === "SESSION_PAUSED"),
        ),
    ).toBe(false);
    context.clients.forEach((client) => client.close());
    replacement.close();
    await context.app.close();
  });
});
