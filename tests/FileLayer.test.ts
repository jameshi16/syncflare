import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FileLayer } from "../src/client/FileLayer";
import type { IFileLayer } from "../src/interfaces/IFileLayer";
import { stringToStream, decodeOrNull } from "./helpers";

describe("FileLayer (reference implementation)", () => {
  let tmpDir: string;
  let fileLayer: IFileLayer;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "syncflare-filelayer-"));
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    fileLayer = new FileLayer(tmpDir);
  }

  test("readFile returns null for missing file", async () => {
    await setup();
    const result = await fileLayer.readFile("nonexistent.txt");
    expect(result).toBeNull();
  });

  test("writeFile and readFile round-trip", async () => {
    await setup();
    const content = "hello syncflare";
    await fileLayer.writeFile("roundtrip.txt", stringToStream(content));
    const result = await fileLayer.readFile("roundtrip.txt");
    expect(await decodeOrNull(result)).toBe(content);
  });

  test("writeFile creates parent directories", async () => {
    await setup();
    await fileLayer.writeFile("nested/sub/deep/file.txt", stringToStream("nested"));
    const result = await fileLayer.readFile("nested/sub/deep/file.txt");
    expect(await decodeOrNull(result)).toBe("nested");
  });

  test("deleteFile removes a file", async () => {
    await setup();
    await fileLayer.writeFile("delete_me.txt", stringToStream("bye"));
    expect(await fileLayer.readFile("delete_me.txt")).not.toBeNull();
    await fileLayer.deleteFile("delete_me.txt");
    expect(await fileLayer.readFile("delete_me.txt")).toBeNull();
  });

  test("deleteFile is a no-op on missing file", async () => {
    await setup();
    await expect(fileLayer.deleteFile("already_gone.txt")).resolves.toBeUndefined();
  });

  test("getMtime returns null for missing file", async () => {
    await setup();
    const mtime = await fileLayer.getMtime("missing.txt");
    expect(mtime).toBeNull();
  });

  test("getMtime returns a number for an existing file", async () => {
    await setup();
    await fileLayer.writeFile("time_check.txt", stringToStream("tick"));
    const mtime = await fileLayer.getMtime("time_check.txt");
    expect(mtime).toBeGreaterThan(0);
  });

  test("scanAllFiles returns empty map for empty directory", async () => {
    await setup();
    const result = await fileLayer.scanAllFiles();
    expect(result.size).toBe(0);
  });

  test("scanAllFiles finds all files and their hashes", async () => {
    await setup();
    await fileLayer.writeFile("alpha.txt", stringToStream("aaa"));
    await fileLayer.writeFile("beta.txt", stringToStream("bbb"));
    // Use node:fs to write a third file directly (simulate pre-existing)
    writeFileSync(join(tmpDir, "gamma.txt"), "ccc");
    const result = await fileLayer.scanAllFiles();
    expect(result.size).toBe(3);
    expect(result.get("gamma.txt")).toBeDefined();
    expect(result.get("gamma.txt")!.hash).toBeTruthy();
  });

  test("scanAllFiles uses knownEntries to skip re-hashing", async () => {
    await setup();
    writeFileSync(join(tmpDir, "cached.txt"), "data");
    // First scan to get the real mtime
    const first = await fileLayer.scanAllFiles();
    const entry = first.get("cached.txt")!;
    // Second scan with knownEntries should return cached hash
    const known = new Map<string, { hash: string; mtime: number }>();
    known.set("cached.txt", { hash: "cached-hash", mtime: entry.mtime });
    const second = await fileLayer.scanAllFiles(known);
    expect(second.get("cached.txt")!.hash).toBe("cached-hash");
  });

  test("scanAllFiles re-hashes when mtime differs", async () => {
    await setup();
    writeFileSync(join(tmpDir, "stale.txt"), "original");
    const known = new Map<string, { hash: string; mtime: number }>();
    known.set("stale.txt", { hash: "stale-hash", mtime: 0 });
    const result = await fileLayer.scanAllFiles(known);
    expect(result.get("stale.txt")!.hash).not.toBe("stale-hash");
  });

  test("scanAllFiles skips directories", async () => {
    await setup();
    mkdirSync(join(tmpDir, "emptydir"));
    await fileLayer.writeFile("emptydir/nope.txt", stringToStream("nope"));
    const result = await fileLayer.scanAllFiles();
    expect(result.size).toBe(1);
    expect(result.has("emptydir/nope.txt")).toBe(true);
  });

  test("onEvent and startWatch fire add event for a new file", async () => {
    await setup();
    const events: string[] = [];
    fileLayer.onEvent((e) => events.push(`${e.type}:${e.path}`));
    await fileLayer.startWatch();
    // Create a file and wait for chokidar to detect it
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        writeFileSync(join(tmpDir, "watch_add.txt"), "hello");
        setTimeout(resolve, 500);
      }, 50);
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e === "add:watch_add.txt")).toBe(true);
    await fileLayer.stopWatch();
  });

  test("onEvent and startWatch fire change event", async () => {
    await setup();
    writeFileSync(join(tmpDir, "watch_change.txt"), "before");
    const events: string[] = [];
    fileLayer.onEvent((e) => events.push(`${e.type}:${e.path}`));
    await fileLayer.startWatch();
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        writeFileSync(join(tmpDir, "watch_change.txt"), "after");
        setTimeout(resolve, 500);
      }, 50);
    });
    expect(events.some((e) => e.includes("change:watch_change.txt"))).toBe(true);
    await fileLayer.stopWatch();
  });

  test("onEvent and startWatch fire unlink event", async () => {
    await setup();
    writeFileSync(join(tmpDir, "watch_unlink.txt"), "bye");
    const events: string[] = [];
    fileLayer.onEvent((e) => events.push(`${e.type}:${e.path}`));
    await fileLayer.startWatch();
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        rmSync(join(tmpDir, "watch_unlink.txt"));
        setTimeout(resolve, 500);
      }, 50);
    });
    expect(events.some((e) => e.includes("unlink:watch_unlink.txt"))).toBe(true);
    await fileLayer.stopWatch();
  });

  test("stopWatch prevents further events", async () => {
    await setup();
    const events: string[] = [];
    fileLayer.onEvent((e) => events.push(`${e.type}:${e.path}`));
    await fileLayer.startWatch();
    await fileLayer.stopWatch();
    writeFileSync(join(tmpDir, "after_stop.txt"), "ignored");
    // Allow a moment for chokidar to potentially fire (it shouldn't)
    await new Promise((r) => setTimeout(r, 300));
    expect(events.length).toBe(0);
  });
});
