import type { IClientDatabase } from "../interfaces/IClientDatabase";
import type { FileEntry } from "../types";

export class MetadataLayer {
  constructor(private db: IClientDatabase) {}

  async getEntry(path: string): Promise<FileEntry | null> {
    return this.db.getEntry(path);
  }

  async upsertEntry(entry: FileEntry): Promise<void> {
    return this.db.upsertEntry(entry);
  }

  async removeEntry(path: string): Promise<void> {
    return this.db.removeEntry(path);
  }

  async getAllEntries(): Promise<FileEntry[]> {
    return this.db.allEntries();
  }

  async getLogNumber(): Promise<number> {
    return this.db.getLogNumber();
  }

  async setLogNumber(n: number): Promise<void> {
    return this.db.setLogNumber(n);
  }

  async updateEntryFromFile(
    path: string,
    hash: string,
    mtime: number,
    logNumber: number,
  ): Promise<void> {
    await this.db.upsertEntry({ path, hash, mtime, logNumber });
  }
}
