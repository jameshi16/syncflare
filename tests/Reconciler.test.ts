import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileLayer } from "../src/client/FileLayer";
import { MetadataLayer } from "../src/client/MetadataLayer";
import { Reconciler } from "../src/client/Reconciler";
import { Database } from "bun:sqlite";
import type { IClientDatabase } from "../src/interfaces/IClientDatabase";
import type { IClientBacking } from "../src/interfaces/IClientBacking";
import type { FileEntry } from "../src/types";
import { mapRowToFileEntry, decodeOrNull, stringToStream } from "./helpers";

class TestClientDB implements IClientDatabase {
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
    return row ? mapRowToFileEntry(row) : null;
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

class TestClientBacking implements IClientBacking {
  private store = new Map<string, ReadableStream<Uint8Array>>();

  async get(path: string): Promise<ReadableStream<Uint8Array> | null> {
    return this.store.get(path) ?? null;
  }

  hasFile(path: string): boolean {
    return this.store.has(path);
  }

  setFile(path: string, content: string): void {
    this.store.set(path, stringToStream(content));
  }
}

describe("Reconciler", () => {
  let tmpDir: string;
  let fileLayer: FileLayer;
  let metadata: MetadataLayer;
  let clientBacking: TestClientBacking;
  let reconciler: Reconciler;
  let clientDb: TestClientDB;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "syncflare-test-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    // clean and recreate tmpDir
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });

    fileLayer = new FileLayer(tmpDir);
    clientDb = new TestClientDB();
    metadata = new MetadataLayer(clientDb);
    clientBacking = new TestClientBacking();
    reconciler = new Reconciler(fileLayer, metadata, clientBacking);
  }

  test("file on disk but not in DB and not on server gets deleted", async () => {
    await setup();
    writeFileSync(join(tmpDir, "orphan.txt"), "local only");
    expect(existsSync(join(tmpDir, "orphan.txt"))).toBe(true);
    await reconciler.run();
    expect(existsSync(join(tmpDir, "orphan.txt"))).toBe(false);
  });

  test("file on disk but not in DB but on server gets pulled (overwritten)", async () => {
    await setup();
    writeFileSync(join(tmpDir, "known.txt"), "local wrong content");
    clientBacking.setFile("known.txt", "server content");
    await reconciler.run();
    const content = await fileLayer.readFile("known.txt");
    expect(await decodeOrNull(content)).toBe("server content");
  });

  test("file in DB but missing from disk gets restored from server", async () => {
    await setup();
    clientBacking.setFile("restore.txt", "please restore");
    await clientDb.upsertEntry({ path: "restore.txt", hash: "oldhash", mtime: 100, logNumber: 1 });
    await reconciler.run();
    const content = await fileLayer.readFile("restore.txt");
    expect(await decodeOrNull(content)).toBe("please restore");
  });

  test("file with changed mtime and hash on disk gets overwritten from server", async () => {
    await setup();
    clientBacking.setFile("stable.txt", "server version");
    writeFileSync(join(tmpDir, "stable.txt"), "tampered version");
    await clientDb.upsertEntry({
      path: "stable.txt",
      hash: "oldhash",
      mtime: 0,
      logNumber: 1,
    });
    await reconciler.run();
    const content = await fileLayer.readFile("stable.txt");
    expect(await decodeOrNull(content)).toBe("server version");
  });
});
