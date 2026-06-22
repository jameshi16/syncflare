import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import type { IServerDatabase } from "../src/interfaces/IServerDatabase";
import type { LogEntry, OpKind } from "../src/types";

class InMemoryServerDB implements IServerDatabase {
  private db: Database;

  constructor() {
    this.db = new Database(":memory:");
    this.db.exec(`
      CREATE TABLE log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  }

  async append(op: OpKind, path: string, hash: string, timestamp: number): Promise<LogEntry> {
    const stmt = this.db.prepare("INSERT INTO log (op, path, hash, timestamp) VALUES (?, ?, ?, ?)");
    const result = stmt.run(op, path, hash, timestamp);
    const id = Number(result.lastInsertRowid);
    return { id, op, path, hash, timestamp };
  }

  async range(after: number): Promise<LogEntry[]> {
    return this.db
      .prepare("SELECT * FROM log WHERE id > ? ORDER BY id ASC")
      .all(after) as LogEntry[];
  }

  async latest(): Promise<number> {
    const row = this.db.prepare("SELECT MAX(id) as max_id FROM log").get() as {
      max_id: number | null;
    };
    return row.max_id ?? 0;
  }
}

describe("InMemoryServerDB", () => {
  test("append returns entry with id", async () => {
    const db = new InMemoryServerDB();
    const entry = await db.append("CREATE", "test.txt", "abc", 1000);
    expect(entry.id).toBe(1);
    expect(entry.op).toBe("CREATE");
    expect(entry.path).toBe("test.txt");
  });

  test("range returns entries after given id", async () => {
    const db = new InMemoryServerDB();
    await db.append("CREATE", "a.txt", "a", 1000);
    await db.append("CREATE", "b.txt", "b", 1001);
    const entries = await db.range(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe("b.txt");
  });

  test("latest returns max id", async () => {
    const db = new InMemoryServerDB();
    expect(await db.latest()).toBe(0);
    await db.append("CREATE", "a.txt", "a", 1000);
    await db.append("CREATE", "b.txt", "b", 1001);
    expect(await db.latest()).toBe(2);
  });
});
