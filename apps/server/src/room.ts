import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SeatId, Team } from "@belote/game-engine";
export interface Participant {
  readonly id: string;
  readonly nickname: string;
  readonly tokenHash: string;
  readonly seat: SeatId;
  readonly team: Team;
  readonly connected: boolean;
}
export interface Room {
  readonly id: string;
  readonly code: string;
  readonly ownerId: string;
  readonly phase: "LOBBY" | "PLAYING";
  readonly participants: readonly Participant[];
}
export interface JoinResult {
  readonly room: Room;
  readonly participant: Participant;
  readonly token: string;
}
export type PublicRoom = Omit<Room, "participants"> & {
  readonly participants: readonly Omit<Participant, "tokenHash">[];
};
export class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () =>
  Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join(
    "",
  );
const makeToken = () => randomBytes(32).toString("base64url");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class RoomService {
  private readonly rooms = new Map<string, Room>();
  restore(room: Room): void {
    this.rooms.set(room.code, {
      ...room,
      participants: room.participants.map((participant) => ({
        ...participant,
        connected: false,
      })),
    });
  }
  create(nickname: string): JoinResult {
    const clean = nickname.trim();
    if (!clean || clean.length > 32)
      throw new RoomError("INVALID_NICKNAME", "Nickname is invalid");
    let code = makeCode();
    while ([...this.rooms.values()].some((room) => room.code === code))
      code = makeCode();
    const rawToken = makeToken();
    const participant: Participant = {
      id: randomUUID(),
      nickname: clean,
      tokenHash: hash(rawToken),
      seat: 0,
      team: "A",
      connected: false,
    };
    const room: Room = {
      id: randomUUID(),
      code,
      ownerId: participant.id,
      phase: "LOBBY",
      participants: [participant],
    };
    this.rooms.set(code, room);
    return { room, participant, token: rawToken };
  }
  join(code: string, nickname: string): JoinResult {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room does not exist");
    if (room.phase !== "LOBBY" || room.participants.length >= 4)
      throw new RoomError("ROOM_FULL", "Room cannot accept a participant");
    const clean = nickname.trim();
    if (!clean || clean.length > 32)
      throw new RoomError("INVALID_NICKNAME", "Nickname is invalid");
    const used = new Set(
      room.participants.map((participant) => participant.seat),
    );
    const seat = ([0, 1, 2, 3] as const).find(
      (candidate) => !used.has(candidate),
    )!;
    const rawToken = makeToken();
    const participant: Participant = {
      id: randomUUID(),
      nickname: clean,
      tokenHash: hash(rawToken),
      seat,
      team: seat % 2 === 0 ? "A" : "B",
      connected: false,
    };
    const updated = {
      ...room,
      participants: [...room.participants, participant],
    };
    this.rooms.set(room.code, updated);
    return { room: updated, participant, token: rawToken };
  }
  get(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError("ROOM_NOT_FOUND", "Room does not exist");
    return room;
  }
  public(room: Room): PublicRoom {
    return {
      ...room,
      participants: room.participants.map(
        ({ tokenHash: _tokenHash, ...participant }) => participant,
      ),
    };
  }
  authenticate(code: string, rawToken: string): Participant {
    const participant = this.get(code).participants.find(
      (candidate) => candidate.tokenHash === hash(rawToken),
    );
    if (!participant)
      throw new RoomError("UNAUTHORIZED", "Invalid session token");
    return participant;
  }
  start(code: string, participantId: string): Room {
    const room = this.get(code);
    if (room.ownerId !== participantId)
      throw new RoomError("FORBIDDEN", "Only the owner can start");
    if (
      room.participants.length !== 4 ||
      new Set(room.participants.map((participant) => participant.team)).size !==
        2
    )
      throw new RoomError(
        "NOT_READY",
        "Four participants and two teams are required",
      );
    const updated = { ...room, phase: "PLAYING" as const };
    this.rooms.set(code, updated);
    return updated;
  }
  assign(
    code: string,
    ownerId: string,
    participantId: string,
    seat: SeatId,
    team: Team,
  ): Room {
    const room = this.get(code);
    if (room.ownerId !== ownerId)
      throw new RoomError("FORBIDDEN", "Only the owner can assign seats");
    if (room.phase !== "LOBBY")
      throw new RoomError("GAME_STARTED", "Seats are locked");
    if (
      !room.participants.some((participant) => participant.id === participantId)
    )
      throw new RoomError("NOT_FOUND", "Participant does not belong to room");
    if (
      room.participants.some(
        (participant) =>
          participant.seat === seat && participant.id !== participantId,
      )
    )
      throw new RoomError("SEAT_TAKEN", "Seat is occupied");
    const updated = {
      ...room,
      participants: room.participants.map((participant) =>
        participant.id === participantId
          ? { ...participant, seat, team }
          : participant,
      ),
    };
    this.rooms.set(code, updated);
    return updated;
  }
}
