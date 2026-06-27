import { unlink, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { IServerBacking } from "../../src/interfaces/IServerBacking";

export class ServerBacking implements IServerBacking {
  constructor(private baseDir: string) {}

  async get(path: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const file = Bun.file(join(this.baseDir, path));
      if (!(await file.exists())) return null;
      return file.stream();
    } catch {
      return null;
    }
  }

  async put(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
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

  async delete(path: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, path));
    } catch {
      // already gone
    }
  }
}
