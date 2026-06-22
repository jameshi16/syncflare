import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { IServerBacking } from "../../src/interfaces/IServerBacking";

export class ServerBacking implements IServerBacking {
  constructor(private baseDir: string) {}

  async get(path: string): Promise<Uint8Array | null> {
    try {
      return await readFile(join(this.baseDir, path));
    } catch {
      return null;
    }
  }

  async put(path: string, data: Uint8Array): Promise<void> {
    const fullPath = join(this.baseDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  async delete(path: string): Promise<void> {
    try {
      await unlink(join(this.baseDir, path));
    } catch {
      // already gone
    }
  }
}
