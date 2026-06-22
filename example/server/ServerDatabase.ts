import { Database } from "bun:sqlite";
import type { IServerDatabase } from "../../src/interfaces/IServerDatabase";
import type { LogEntry, OpKind } from "../../src/types";
import { SERVER_DDL } from "../shared/schema";

export class ServerDatabase implements IServerDatabase {
  private db: Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.exec(SERVER_DDL);
  }

  async append(op: OpKind, path: string, hash: string, timestamp: number): Promise<LogEntry> {
    const stmt = this.db.prepare("INSERT INTO log (op, path, hash, timestamp) VALUES (?, ?, ?, ?)");
    const result = stmt.run(op, path, hash, timestamp);
    const id = Number(result.lastInsertRowid);
    return { id, op, path, hash, timestamp };
  }

  async range(after: number): Promise<LogEntry[]> {
    const stmt = this.db.prepare("SELECT * FROM log WHERE id > ? ORDER BY id ASC");
    return stmt.all(after) as LogEntry[];
  }

  async latest(): Promise<number> {
    const row = this.db.prepare("SELECT MAX(id) as max_id FROM log").get() as {
      max_id: number | null;
    };
    return row.max_id ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
