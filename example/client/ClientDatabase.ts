import { Database } from "bun:sqlite";
import type { IClientDatabase } from "../../src/interfaces/IClientDatabase";
import type { FileEntry } from "../../src/types";
import { CLIENT_DDL } from "../shared/schema";

export class ClientDatabase implements IClientDatabase {
  private db: Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.exec(CLIENT_DDL);
    this.db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('log_number', '0')").run();
  }

  private static mapRow(row: Record<string, unknown>): FileEntry {
    return {
      path: row.path as string,
      hash: row.hash as string,
      mtime: row.mtime as number,
      logNumber: row.log_number as number,
    };
  }

  async getEntry(path: string): Promise<FileEntry | null> {
    const row = this.db.prepare("SELECT * FROM files WHERE path = ?").get(path) as Record<
      string,
      unknown
    > | null;
    if (!row) return null;
    return ClientDatabase.mapRow(row);
  }

  async upsertEntry(entry: FileEntry): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO files (path, hash, mtime, log_number) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, mtime = excluded.mtime, log_number = excluded.log_number",
      )
      .run(entry.path, entry.hash, entry.mtime, entry.logNumber);
  }

  async removeEntry(path: string): Promise<void> {
    this.db.prepare("DELETE FROM files WHERE path = ?").run(path);
  }

  async allEntries(): Promise<FileEntry[]> {
    const rows = this.db.prepare("SELECT * FROM files").all() as Record<string, unknown>[];
    return rows.map(ClientDatabase.mapRow);
  }

  async getLogNumber(): Promise<number> {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'log_number'").get() as {
      value: string;
    } | null;
    return row ? Number(row.value) : 0;
  }

  async setLogNumber(n: number): Promise<void> {
    this.db.prepare("UPDATE meta SET value = ? WHERE key = 'log_number'").run(String(n));
  }

  close(): void {
    this.db.close();
  }
}
