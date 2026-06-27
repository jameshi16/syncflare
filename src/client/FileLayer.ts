import { watch, type FSWatcher } from "chokidar";
import { readdir, stat, readFile, unlink, mkdir } from "node:fs/promises";
import type { Stats } from "node:fs";
import { join, relative, dirname } from "node:path";
import { normalizePath } from "../util/pathNormalizer";
import { hashBuffer } from "../util/hash";

export interface FileEvent {
  type: "add" | "change" | "unlink";
  path: string;
}

export class FileLayer {
  private watcher: FSWatcher | null = null;
  private eventHandler: ((event: FileEvent) => void) | null = null;

  constructor(private baseDir: string) {}

  onEvent(handler: (event: FileEvent) => void): void {
    this.eventHandler = handler;
  }

  async startWatch(): Promise<void> {
    this.watcher = watch(this.baseDir, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    this.watcher.on("add", (p) => {
      const rel = this.toRelative(p);
      this.eventHandler?.({ type: "add", path: rel });
    });

    this.watcher.on("change", (p) => {
      const rel = this.toRelative(p);
      this.eventHandler?.({ type: "change", path: rel });
    });

    this.watcher.on("unlink", (p) => {
      const rel = this.toRelative(p);
      this.eventHandler?.({ type: "unlink", path: rel });
    });
  }

  async stopWatch(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  async scanAllFiles(
    knownEntries?: Map<string, { hash: string; mtime: number }>,
  ): Promise<Map<string, { hash: string; mtime: number }>> {
    const result = new Map<string, { hash: string; mtime: number }>();
    await this.scanDir("", result, knownEntries);
    return result;
  }

  private async scanDir(
    relDir: string,
    acc: Map<string, { hash: string; mtime: number }>,
    knownEntries?: Map<string, { hash: string; mtime: number }>,
  ): Promise<void> {
    const fullDir = join(this.baseDir, relDir);
    let entries: string[];
    try {
      entries = await readdir(fullDir);
    } catch {
      return;
    }

    for (const name of entries) {
      const fullPath = join(fullDir, name);
      const relPath = normalizePath(join(relDir, name));
      let s: Stats;
      try {
        s = await stat(fullPath);
      } catch {
        continue;
      }

      if (s.isDirectory()) {
        await this.scanDir(relPath, acc, knownEntries);
      } else if (s.isFile()) {
        const known = knownEntries?.get(relPath);
        if (known && known.mtime === s.mtimeMs) {
          acc.set(relPath, { hash: known.hash, mtime: s.mtimeMs });
        } else {
          const content = await readFile(fullPath);
          const hash = await hashBuffer(content);
          acc.set(relPath, { hash, mtime: s.mtimeMs });
        }
      }
    }
  }

  async readFile(path: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const file = Bun.file(join(this.baseDir, path));
      if (!(await file.exists())) return null;
      return file.stream();
    } catch {
      return null;
    }
  }

  async writeFile(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const fullPath = join(this.baseDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    try {
      await unlink(fullPath);
    } catch {
      // file doesn't exist yet
    }
    const file = Bun.file(fullPath);
    const writer = file.writer();
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
    }
    await writer.end();
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, path));
    } catch {
      // file might already be gone
    }
  }

  async getMtime(path: string): Promise<number | null> {
    try {
      const s = await stat(join(this.baseDir, path));
      return s.mtimeMs;
    } catch {
      return null;
    }
  }

  private toRelative(absPath: string): string {
    return normalizePath(relative(this.baseDir, absPath));
  }
}
