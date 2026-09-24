import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { clientMessageSchema } from "@belote/protocol";
import {
  createDeck,
  createGame,
  getPlayerView,
  startDeal,
} from "@belote/game-engine";
import type { GameState } from "@belote/game-engine";
import {
  RoomError,
  RoomService,
  type Participant,
  type PublicRoom,
} from "./room.js";
import {
  SessionService,
  type SessionRepository,
  type SessionSnapshot,
} from "./session.js";
import { SQLiteSessionRepository } from "./sqlite.js";
import { ConnectionRegistry } from "./connections.js";

function safeRoom(room: PublicRoom): PublicRoom {
  return room;
}
export function buildServer(options: { repository?: SessionRepository } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  const rooms = new RoomService();
  const databasePath = process.env.DATABASE_PATH ?? "./data/sessions.sqlite";
  if (!options.repository)
    mkdirSync(dirname(databasePath), { recursive: true });
  const repository =
    options.repository ?? new SQLiteSessionRepository(databasePath);
  if (repository instanceof SQLiteSessionRepository)
    for (const snapshot of repository.list()) {
      rooms.restore(snapshot.room);
      if (snapshot.game && !snapshot.suspended)
        void repository.save(
          { ...snapshot, suspended: true, version: snapshot.version + 1 },
          snapshot.version,
        );
    }
  const connections = new ConnectionRegistry();
  const broadcastRoom = (room: PublicRoom, version: number) => {
    const message = JSON.stringify({
      type: "ROOM_STATE",
      version,
      state: room,
    });
    for (const participant of room.participants) {
      const socket = connections.get(participant.id)?.socket;
      if (socket?.readyState === 1) socket.send(message);
    }
  };
  const sessions = new SessionService(repository, {
    sendToPlayer: async () => {},
    broadcastPublic: async () => {},
  });
  const allowedOrigins = new Set(
    (
      process.env.ALLOWED_ORIGINS ??
      "http://localhost:5173,http://127.0.0.1:3000"
    )
      .split(",")
      .map((origin) => origin.trim()),
  );
  app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  const heartbeatInterval = Number(
    process.env.WS_HEARTBEAT_INTERVAL_MS ?? 15_000,
  );
  const heartbeatTimeout = Number(
    process.env.WS_HEARTBEAT_TIMEOUT_MS ?? 30_000,
  );
  const lastPong = new Map<string, number>();
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const connection of connections.values()) {
      if (now - (lastPong.get(connection.id) ?? 0) > heartbeatTimeout)
        connection.socket.terminate();
      else connection.socket.ping();
    }
  }, heartbeatInterval);
  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    connections.clear();
    const close = (repository as unknown as { close?: () => void }).close;
    close?.call(repository);
  });
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "content-type");
      reply.header("Vary", "Origin");
    }
    if (request.method === "OPTIONS") return reply.code(204).send();
    if (origin && !allowedOrigins.has(origin))
      return reply
        .code(403)
        .send({ code: "ORIGIN_FORBIDDEN", message: "Origin is not allowed" });
  });
  app.get("/health", async () => ({ ok: true }));
  app.post<{ Body: { nickname: string } }>("/rooms", async (request, reply) => {
    try {
      const result = rooms.create(request.body.nickname);
      await repository.save(
        { room: result.room, game: null, version: 0, processed: [] },
        0,
      );
      return reply.code(201).send({
        code: result.room.code,
        participantId: result.participant.id,
        token: result.token,
        room: safeRoom(rooms.public(result.room)),
      });
    } catch (error) {
      const e = error as RoomError;
      return reply.code(400).send({ code: e.code, message: e.message });
    }
  });
  app.post<{ Params: { code: string }; Body: { nickname: string } }>(
    "/rooms/:code/join",
    async (request, reply) => {
      try {
        const result = rooms.join(request.params.code, request.body.nickname);
        const current = await repository.get(result.room.id);
        await repository.save(
          {
            room: result.room,
            game: current?.game ?? null,
            version: (current?.version ?? 0) + 1,
            processed: current?.processed ?? [],
          },
          current?.version ?? 0,
        );
        broadcastRoom(rooms.public(result.room), (current?.version ?? 0) + 1);
        return reply.code(201).send({
          code: result.room.code,
          participantId: result.participant.id,
          token: result.token,
          room: safeRoom(rooms.public(result.room)),
        });
      } catch (error) {
        const e = error as RoomError;
        return reply.code(400).send({ code: e.code, message: e.message });
      }
    },
  );
  app.get<{ Params: { code: string } }>(
    "/rooms/:code",
    async (request, reply) => {
      try {
        return rooms.public(rooms.get(request.params.code));
      } catch (error) {
        const e = error as RoomError;
        return reply.code(404).send({ code: e.code, message: e.message });
      }
    },
  );
  app.post<{
    Params: { code: string };
    Body: {
      token: string;
      participantId: string;
      seat: 0 | 1 | 2 | 3;
      team: "A" | "B";
    };
  }>("/rooms/:code/assign", async (request, reply) => {
    try {
      const participant = rooms.authenticate(
        request.params.code,
        request.body.token,
      );
      const room = rooms.assign(
        request.params.code,
        participant.id,
        request.body.participantId,
        request.body.seat,
        request.body.team,
      );
      const current = await repository.get(room.id);
      await repository.save(
        {
          room,
          game: current?.game ?? null,
          version: (current?.version ?? 0) + 1,
          processed: current?.processed ?? [],
        },
        current?.version ?? 0,
      );
      broadcastRoom(rooms.public(room), (current?.version ?? 0) + 1);
      return rooms.public(room);
    } catch (error) {
      const e = error as RoomError;
      return reply
        .code(e.code === "UNAUTHORIZED" ? 401 : 400)
        .send({ code: e.code, message: e.message });
    }
  });
  app.post<{ Params: { code: string }; Body: { token: string } }>(
    "/rooms/:code/start",
    async (request, reply) => {
      try {
        const participant = rooms.authenticate(
          request.params.code,
          request.body.token,
        );
        const room = rooms.start(request.params.code, participant.id);
        const current = await repository.get(room.id);
        const game = startDeal(
          createGame(room.participants[0]!.seat),
          createDeck(),
        ).state;
        await repository.save(
          {
            room,
            game,
            version: (current?.version ?? 0) + 1,
            processed: current?.processed ?? [],
          },
          current?.version ?? 0,
        );
        broadcastRoom(rooms.public(room), (current?.version ?? 0) + 1);
        for (const target of room.participants) {
          const client = connections.get(target.id)?.socket;
          if (client?.readyState === 1)
            client.send(
              JSON.stringify({
                type: "GAME_STATE",
                version: (current?.version ?? 0) + 1,
                state: getPlayerView(game, target.seat),
              }),
            );
        }
        return rooms.public(room);
      } catch (error) {
        const e = error as RoomError;
        return reply
          .code(e.code === "UNAUTHORIZED" ? 401 : 400)
          .send({ code: e.code, message: e.message });
      }
    },
  );
  if (process.env.E2E_FIXTURE === "1") {
    app.post<{ Body: { game: GameState } }>(
      "/__test/fixture",
      async (request, reply) => {
        try {
          const names = ["Alice", "Bob", "Carol", "David"];
          const first = rooms.create(names[0]!);
          let current = first.room;
          const tokens = [first.token];
          for (const name of names.slice(1)) {
            const joined = rooms.join(current.code, name);
            current = joined.room;
            tokens.push(joined.token);
          }
          current = { ...current, phase: "PLAYING" };
          rooms.restore(current);
          await repository.save(
            {
              room: current,
              game: request.body.game,
              version: 0,
              processed: [],
            },
            0,
          );
          return reply.send({
            code: current.code,
            tokens,
            participants: current.participants.map(
              ({ tokenHash: _tokenHash, ...participant }) => participant,
            ),
          });
        } catch {
          return reply
            .code(400)
            .send({ code: "INVALID_FIXTURE", message: "Fixture rejected" });
        }
      },
    );
  }
  app.register(async (instance) => {
    instance.get<{ Params: { code: string } }>(
      "/rooms/:code/ws",
      { websocket: true },
      (socket: WebSocket, request) => {
        const code = request.params.code;
        let participant: Participant | null = null;
        let authenticated = false;
        let connectionId: string | null = null;
        let messages = 0;
        const started = Date.now();
        const send = (message: unknown) => {
          if (socket.readyState === 1) socket.send(JSON.stringify(message));
        };
        socket.on("pong", () => {
          if (connectionId) lastPong.set(connectionId, Date.now());
        });
        socket.on("close", async () => {
          if (
            !participant ||
            !connectionId ||
            !connections.remove(connectionId, participant.id)
          )
            return;
          const room = rooms.get(code);
          const snapshot = await repository.get(room.id);
          if (snapshot?.game && snapshot.game.phase !== "GAME_COMPLETED") {
            const paused = await sessions.setSuspended(snapshot, true);
            for (const target of paused.room.participants) {
              const client = connections.get(target.id)?.socket;
              if (client && client.readyState === 1)
                client.send(JSON.stringify({ type: "SESSION_PAUSED" }));
            }
          }
        });
        socket.on("message", async (raw: Buffer) => {
          if (raw.byteLength > 64 * 1024) {
            socket.close(1009, "Message too large");
            return;
          }
          if (++messages > 120 && Date.now() - started < 60_000) {
            send({
              type: "COMMAND_REJECTED",
              code: "RATE_LIMITED",
              message: "Too many messages",
            });
            return;
          }
          let input: unknown;
          try {
            input = JSON.parse(raw.toString());
          } catch {
            send({
              type: "COMMAND_REJECTED",
              code: "INVALID_MESSAGE",
              message: "Invalid JSON",
            });
            return;
          }
          const parsed = clientMessageSchema.safeParse(input);
          if (!parsed.success) {
            send({
              type: "COMMAND_REJECTED",
              code: "INVALID_MESSAGE",
              message: "Invalid protocol message",
            });
            return;
          }
          if (parsed.data.type === "AUTH") {
            try {
              participant = rooms.authenticate(code, parsed.data.token);
              authenticated = true;
              const registered = connections.register(participant.id, socket);
              connectionId = registered.connection.id;
              lastPong.set(connectionId, Date.now());
              if (registered.replaced)
                registered.replaced.socket.close(4001, "Replaced");
              const room = rooms.get(code);
              let snapshot = await repository.get(room.id);
              let resumed = false;
              if (
                snapshot?.suspended &&
                room.participants.every((target) => connections.get(target.id))
              ) {
                snapshot = await sessions.setSuspended(snapshot, false);
                resumed = true;
              }
              send({
                type: "ROOM_STATE",
                version: snapshot?.version ?? 0,
                state: rooms.public(room),
              });
              if (snapshot?.game)
                send({
                  type: "GAME_STATE",
                  version: snapshot.version,
                  state: getPlayerView(snapshot.game, participant.seat),
                });
              if (resumed) {
                for (const target of room.participants) {
                  const client = connections.get(target.id)?.socket;
                  if (client && client.readyState === 1) {
                    client.send(JSON.stringify({ type: "SESSION_RESUMED" }));
                    if (snapshot?.game)
                      client.send(
                        JSON.stringify({
                          type: "GAME_STATE",
                          version: snapshot.version,
                          state: getPlayerView(snapshot.game, target.seat),
                        }),
                      );
                  }
                }
              }
            } catch {
              send({
                type: "COMMAND_REJECTED",
                code: "UNAUTHORIZED",
                message: "Authentication failed",
              });
            }
            return;
          }
          if (!authenticated || !participant) {
            send({
              type: "COMMAND_REJECTED",
              code: "AUTH_REQUIRED",
              message: "Authenticate first",
            });
            return;
          }
          if (parsed.data.type === "START_DEAL") {
            try {
              const room = rooms.get(code);
              if (room.ownerId !== participant.id) throw new Error("FORBIDDEN");
              const snapshot = await repository.get(room.id);
              if (!snapshot?.game || snapshot.game.phase !== "DEAL_COMPLETED")
                throw new Error("DEAL_NOT_COMPLETED");
              const nextGame = startDeal(snapshot.game, createDeck()).state;
              const next = {
                ...snapshot,
                game: nextGame,
                version: snapshot.version + 1,
              };
              await repository.save(next, snapshot.version);
              for (const target of next.room.participants) {
                const client = connections.get(target.id)?.socket;
                if (client?.readyState === 1)
                  client.send(
                    JSON.stringify({
                      type: "GAME_STATE",
                      version: next.version,
                      state: getPlayerView(next.game, target.seat),
                    }),
                  );
              }
            } catch (error) {
              send({
                type: "COMMAND_REJECTED",
                code:
                  error instanceof Error
                    ? error.message
                    : "START_DEAL_REJECTED",
                message: "Deal cannot start",
              });
            }
            return;
          }
          if (parsed.data.type !== "GAME_COMMAND") {
            send({
              type: "COMMAND_REJECTED",
              code: "UNSUPPORTED_COMMAND",
              message: "Unsupported command",
            });
            return;
          }
          try {
            const room = rooms.get(code);
            const snapshot = await repository.get(room.id);
            if (!snapshot) throw new Error("GAME_NOT_STARTED");
            const result = await sessions.command(
              snapshot,
              participant,
              parsed.data.commandId,
              parsed.data.expectedVersion,
              parsed.data.command,
            );
            send({
              type: "COMMAND_ACK",
              commandId: parsed.data.commandId,
              version: result.version,
            });
            const latest = await repository.get(room.id);
            if (latest?.game)
              for (const target of latest.room.participants) {
                const client = connections.get(target.id)?.socket;
                if (client?.readyState === 1)
                  client.send(
                    JSON.stringify({
                      type: "GAME_STATE",
                      version: latest.version,
                      state: getPlayerView(latest.game, target.seat),
                    }),
                  );
              }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "COMMAND_REJECTED";
            send({
              type: "COMMAND_REJECTED",
              code: message,
              message: "Command rejected",
            });
          }
        });
      },
    );
  });
  const staticRoot =
    process.env.STATIC_ROOT ?? join(process.cwd(), "apps/web/dist");
  if (existsSync(staticRoot))
    app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      index: ["index.html"],
    });
  return app;
}
if (process.argv[1]?.endsWith("main.js"))
  void buildServer().listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
  });
