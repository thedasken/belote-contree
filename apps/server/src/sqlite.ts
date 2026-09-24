import { DatabaseSync } from "node:sqlite";
import type { SessionRepository, SessionSnapshot } from "./session.js";

/** Minimal active-session snapshot store. Tokens are never written by this adapter. */
export class SQLiteSessionRepository implements SessionRepository {
  private readonly database: DatabaseSync;
  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, snapshot TEXT NOT NULL)",
    );
  }
  async get(id: string): Promise<SessionSnapshot | null> {
    const row = this.database
      .prepare("SELECT snapshot FROM sessions WHERE id = ?")
      .get(id) as { snapshot?: string } | undefined;
    return row?.snapshot ? (JSON.parse(row.snapshot) as SessionSnapshot) : null;
  }
  list(): readonly SessionSnapshot[] {
    return (
      this.database.prepare("SELECT snapshot FROM sessions").all() as Array<{
        snapshot: string;
      }>
    ).map((row) => JSON.parse(row.snapshot) as SessionSnapshot);
  }
  async save(
    snapshot: SessionSnapshot,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.database
      .prepare("SELECT version FROM sessions WHERE id = ?")
      .get(snapshot.room.id) as { version?: number } | undefined;
    if ((current?.version ?? 0) !== expectedVersion)
      throw new Error("VERSION_CONFLICT");
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          "INSERT INTO sessions (id, version, snapshot) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, snapshot = excluded.snapshot",
        )
        .run(snapshot.room.id, snapshot.version, JSON.stringify(snapshot));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  async delete(id: string): Promise<void> {
    this.database.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
  close(): void {
    this.database.close();
  }
}
