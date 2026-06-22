import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileLayer } from "../src/client/FileLayer";
import { MetadataLayer } from "../src/client/MetadataLayer";
import { CatchUpPlanner } from "../src/client/CatchUpPlanner";
import { Database } from "bun:sqlite";
import type { AtomicOperation } from "../src/types";
import type { IClientDatabase } from "../src/interfaces/IClientDatabase";
import type { IServerBacking } from "../src/interfaces/IServerBacking";
import type { FileEntry } from "../src/types";
import { mapRowToFileEntry, decodeOrNull } from "./helpers";

class TestClientDB implements IClientDatabase {
  private db: Database;
  constructor() {
    this.db = new Database(":memory:");
    this.db.exec(`
      CREATE TABLE files (path TEXT PRIMARY KEY, hash TEXT NOT NULL, mtime INTEGER NOT NULL, log_number INTEGER NOT NULL);
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.db.prepare("INSERT INTO meta (key, value) VALUES ('log_number', '0')").run();
  }
  async getEntry(path: string): Promise<FileEntry | null> {
    const row = this.db.prepare("SELECT * FROM files WHERE path = ?").get(path) as Record<
      string,
      unknown
    > | null;
    return row ? mapRowToFileEntry(row) : null;
  }
  async upsertEntry(entry: FileEntry): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO files (path, hash, mtime, log_number) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET hash=excluded.hash, mtime=excluded.mtime, log_number=excluded.log_number",
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

class TestServerBacking implements IServerBacking {
  private store = new Map<string, Uint8Array>();

  async get(path: string): Promise<Uint8Array | null> {
    return this.store.get(path) ?? null;
  }
  async put(path: string, data: Uint8Array): Promise<void> {
    this.store.set(path, data);
  }
  async delete(path: string): Promise<void> {
    this.store.delete(path);
  }

  setFile(path: string, content: string): void {
    this.store.set(path, new TextEncoder().encode(content));
  }

  hasFile(path: string): boolean {
    return this.store.has(path);
  }
}

describe("CatchUpPlanner", () => {
  let tmpDir: string;
  let fileLayer: FileLayer;
  let metadata: MetadataLayer;
  let serverBacking: TestServerBacking;
  let planner: CatchUpPlanner;
  let clientDb: TestClientDB;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "syncflare-catchup-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    fileLayer = new FileLayer(tmpDir);
    clientDb = new TestClientDB();
    metadata = new MetadataLayer(clientDb);
    serverBacking = new TestServerBacking();
    planner = new CatchUpPlanner(fileLayer, metadata, serverBacking);
  }

  test("applies CREATE operations by writing files", async () => {
    await setup();
    serverBacking.setFile("new.txt", "hello world");
    const ops: AtomicOperation[] = [{ op: "CREATE", path: "new.txt", hash: "abc" }];
    await planner.apply(ops, 1);
    const content = await fileLayer.readFile("new.txt");
    expect(decodeOrNull(content)).toBe("hello world");
  });

  test("applies REPLACE operations by overwriting files", async () => {
    await setup();
    serverBacking.setFile("existed.txt", "updated");
    writeFileSync(join(tmpDir, "existed.txt"), "original");
    const ops: AtomicOperation[] = [{ op: "REPLACE", path: "existed.txt", hash: "def" }];
    await planner.apply(ops, 2);
    const content = await fileLayer.readFile("existed.txt");
    expect(decodeOrNull(content)).toBe("updated");
  });

  test("applies DELETE operations by removing files", async () => {
    await setup();
    writeFileSync(join(tmpDir, "toremove.txt"), "bye");
    const ops: AtomicOperation[] = [{ op: "DELETE", path: "toremove.txt", hash: "" }];
    await planner.apply(ops, 3);
    const content = await fileLayer.readFile("toremove.txt");
    expect(content).toBeNull();
  });

  test("updates metadata and logNumber after apply", async () => {
    await setup();
    serverBacking.setFile("meta.txt", "data");
    const ops: AtomicOperation[] = [{ op: "CREATE", path: "meta.txt", hash: "xyz" }];
    await planner.apply(ops, 42);
    const entry = await metadata.getEntry("meta.txt");
    expect(entry).not.toBeNull();
    expect(entry!.hash).toBe("xyz");
    expect(entry!.logNumber).toBe(42);
    expect(await metadata.getLogNumber()).toBe(42);
  });

  test("multiple operations can be applied in parallel", async () => {
    await setup();
    serverBacking.setFile("a.txt", "aaa");
    serverBacking.setFile("b.txt", "bbb");
    serverBacking.setFile("c.txt", "ccc");
    const ops: AtomicOperation[] = [
      { op: "CREATE", path: "a.txt", hash: "h1" },
      { op: "CREATE", path: "b.txt", hash: "h2" },
      { op: "CREATE", path: "c.txt", hash: "h3" },
    ];
    await planner.apply(ops, 10);
    expect(await fileLayer.readFile("a.txt")).not.toBeNull();
    expect(await fileLayer.readFile("b.txt")).not.toBeNull();
    expect(await fileLayer.readFile("c.txt")).not.toBeNull();
  });

  test("metadata is updated for all paths after apply", async () => {
    await setup();
    serverBacking.setFile("keep.txt", "content");
    const ops: AtomicOperation[] = [
      { op: "CREATE", path: "keep.txt", hash: "hhh" },
      { op: "DELETE", path: "gone.txt", hash: "" },
    ];
    await planner.apply(ops, 5);
    const keepEntry = await metadata.getEntry("keep.txt");
    expect(keepEntry).not.toBeNull();
    const goneEntry = await metadata.getEntry("gone.txt");
    expect(goneEntry).toBeNull();
  });
});
