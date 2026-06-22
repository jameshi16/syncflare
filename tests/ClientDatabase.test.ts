import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import type { IClientDatabase } from "../src/interfaces/IClientDatabase";
import type { FileEntry } from "../src/types";
import { mapRowToFileEntry } from "./helpers";

class InMemoryClientDB implements IClientDatabase {
  private db: Database;

  constructor() {
    this.db = new Database(":memory:");
    this.db.exec(`
      CREATE TABLE files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        log_number INTEGER NOT NULL
      );
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('log_number', '0')").run();
  }

  async getEntry(path: string): Promise<FileEntry | null> {
    const row = this.db.prepare("SELECT * FROM files WHERE path = ?").get(path) as Record<
      string,
      unknown
    > | null;
    if (!row) return null;
    return mapRowToFileEntry(row);
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
    return rows.map(mapRowToFileEntry);
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
}

describe("InMemoryClientDB", () => {
  test("getEntry returns null for missing path", async () => {
    const db = new InMemoryClientDB();
    expect(await db.getEntry("nope.txt")).toBeNull();
  });

  test("upsertEntry creates and updates", async () => {
    const db = new InMemoryClientDB();
    await db.upsertEntry({ path: "a.txt", hash: "abc", mtime: 100, logNumber: 1 });
    const entry = await db.getEntry("a.txt");
    expect(entry!.hash).toBe("abc");

    await db.upsertEntry({ path: "a.txt", hash: "def", mtime: 200, logNumber: 2 });
    const updated = await db.getEntry("a.txt");
    expect(updated!.hash).toBe("def");
  });

  test("removeEntry removes the entry", async () => {
    const db = new InMemoryClientDB();
    await db.upsertEntry({ path: "a.txt", hash: "abc", mtime: 100, logNumber: 1 });
    await db.removeEntry("a.txt");
    expect(await db.getEntry("a.txt")).toBeNull();
  });

  test("allEntries returns all entries", async () => {
    const db = new InMemoryClientDB();
    await db.upsertEntry({ path: "a.txt", hash: "a", mtime: 1, logNumber: 1 });
    await db.upsertEntry({ path: "b.txt", hash: "b", mtime: 2, logNumber: 2 });
    const entries = await db.allEntries();
    expect(entries).toHaveLength(2);
  });

  test("logNumber is 0 initially", async () => {
    const db = new InMemoryClientDB();
    expect(await db.getLogNumber()).toBe(0);
  });

  test("setLogNumber updates value", async () => {
    const db = new InMemoryClientDB();
    await db.setLogNumber(42);
    expect(await db.getLogNumber()).toBe(42);
  });
});
