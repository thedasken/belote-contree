import { execute, getPlayerView } from "@belote/game-engine";
import type { GameCommand, GameState, PlayerView } from "@belote/game-engine";
import type { Participant, Room } from "./room.js";
export interface SessionSnapshot {
  readonly room: Room;
  readonly game: GameState | null;
  readonly version: number;
  readonly processed: readonly string[];
  readonly suspended?: boolean;
}
export interface SessionRepository {
  get(roomId: string): Promise<SessionSnapshot | null>;
  save(snapshot: SessionSnapshot, expectedVersion: number): Promise<void>;
  delete(roomId: string): Promise<void>;
}
export interface EventPublisher {
  sendToPlayer(participantId: string, message: unknown): Promise<void>;
  broadcastPublic(roomId: string, message: unknown): Promise<void>;
}
export class MemorySessionRepository implements SessionRepository {
  private readonly data = new Map<string, SessionSnapshot>();
  async get(id: string) {
    return this.data.get(id) ?? null;
  }
  async save(snapshot: SessionSnapshot, expectedVersion: number) {
    const current = this.data.get(snapshot.room.id);
    if ((current?.version ?? 0) !== expectedVersion)
      throw new Error("VERSION_CONFLICT");
    this.data.set(snapshot.room.id, snapshot);
  }
  async delete(id: string) {
    this.data.delete(id);
  }
}
export class SessionService {
  private readonly queues = new Map<string, Promise<unknown>>();
  constructor(
    private readonly repository: SessionRepository,
    private readonly publisher: EventPublisher,
  ) {}
  async setSuspended(
    snapshot: SessionSnapshot,
    suspended: boolean,
  ): Promise<SessionSnapshot> {
    const current = (await this.repository.get(snapshot.room.id)) ?? snapshot;
    if (current.suspended === suspended) return current;
    const next = { ...current, suspended, version: current.version + 1 };
    await this.repository.save(next, current.version);
    return next;
  }
  async command(
    snapshot: SessionSnapshot,
    participant: Participant,
    commandId: string,
    expectedVersion: number,
    command: GameCommand,
  ): Promise<{ version: number; view: PlayerView }> {
    const previous = this.queues.get(snapshot.room.id) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const current = (await this.repository.get(snapshot.room.id)) ?? snapshot;
      if (current.processed.includes(commandId))
        throw new Error("DUPLICATE_COMMAND");
      if (current.version !== expectedVersion) throw new Error("STALE_VERSION");
      if (!current.game) throw new Error("GAME_NOT_STARTED");
      if (current.suspended) throw new Error("SESSION_PAUSED");
      if (command.seat !== participant.seat) throw new Error("FORBIDDEN_SEAT");
      const result = execute(current.game, command);
      const next: SessionSnapshot = {
        ...current,
        game: result.state,
        version: current.version + 1,
        processed: [...current.processed, commandId],
      };
      await this.repository.save(next, current.version);
      await this.publisher.broadcastPublic(current.room.id, {
        type: "ROOM_STATE",
        version: next.version,
        state: next.room,
      });
      return {
        version: next.version,
        view: getPlayerView(next.game!, participant.seat),
      };
    });
    this.queues.set(snapshot.room.id, operation);
    try {
      return await operation;
    } finally {
      if (this.queues.get(snapshot.room.id) === operation)
        this.queues.delete(snapshot.room.id);
    }
  }
}
