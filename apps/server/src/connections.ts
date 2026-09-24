import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";

export interface ActiveConnection {
  readonly id: string;
  readonly participantId: string;
  readonly socket: WebSocket;
}
export class ConnectionRegistry {
  private readonly active = new Map<string, ActiveConnection>();
  register(
    participantId: string,
    socket: WebSocket,
  ): { connection: ActiveConnection; replaced: ActiveConnection | null } {
    const connection = { id: randomUUID(), participantId, socket };
    const replaced = this.active.get(participantId) ?? null;
    this.active.set(participantId, connection);
    return { connection, replaced };
  }
  get(participantId: string): ActiveConnection | null {
    return this.active.get(participantId) ?? null;
  }
  isActive(connectionId: string, participantId: string): boolean {
    return this.active.get(participantId)?.id === connectionId;
  }
  remove(connectionId: string, participantId: string): boolean {
    if (!this.isActive(connectionId, participantId)) return false;
    this.active.delete(participantId);
    return true;
  }
  values(): readonly ActiveConnection[] {
    return [...this.active.values()];
  }
  clear(): void {
    this.active.clear();
  }
}
