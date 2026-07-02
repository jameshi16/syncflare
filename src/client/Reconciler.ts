import { MetadataLayer } from "./MetadataLayer";
import type { IFileLayer } from "../interfaces/IFileLayer";
import type { IClientBacking } from "../interfaces/IClientBacking";
import { hashStream } from "../util/hash";

export class Reconciler {
  constructor(
    private fileLayer: IFileLayer,
    private metadata: MetadataLayer,
    private clientBacking: IClientBacking,
  ) {}

  private async pullAndHash(path: string): Promise<{ hash: string } | null> {
    const stream = await this.clientBacking.get(path);
    if (!stream) return null;
    const [forHash, forWrite] = stream.tee();
    await this.fileLayer.writeFile(path, forWrite);
    const newHash = await hashStream(forHash);
    return { hash: newHash };
  }

  async run(): Promise<{ pulled: number; deleted: number }> {
    const dbEntries = await this.metadata.getAllEntries();
    const knownEntries = new Map(dbEntries.map((e) => [e.path, { hash: e.hash, mtime: e.mtime }]));
    const diskFiles = await this.fileLayer.scanAllFiles(knownEntries);
    const dbMap = new Map(dbEntries.map((e) => [e.path, e]));

    let pulled = 0;
    let deleted = 0;

    for (const [path, diskInfo] of diskFiles) {
      const dbEntry = dbMap.get(path);

      if (!dbEntry) {
        const result = await this.pullAndHash(path);
        if (result) {
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, result.hash, mtime ?? 0, 0);
          pulled++;
        } else {
          await this.fileLayer.deleteFile(path);
          deleted++;
        }
      } else if (dbEntry.mtime !== diskInfo.mtime || dbEntry.hash !== diskInfo.hash) {
        const result = await this.pullAndHash(path);
        if (result) {
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, result.hash, mtime ?? 0, dbEntry.logNumber);
          pulled++;
        } else {
          await this.fileLayer.deleteFile(path);
          await this.metadata.removeEntry(path);
          deleted++;
        }
      }
    }

    for (const [path, entry] of dbMap) {
      if (!diskFiles.has(path)) {
        const result = await this.pullAndHash(path);
        if (result) {
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, result.hash, mtime ?? 0, entry.logNumber);
          pulled++;
        } else {
          await this.metadata.removeEntry(path);
        }
      }
    }

    return { pulled, deleted };
  }
}
