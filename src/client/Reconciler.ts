import { FileLayer } from "./FileLayer";
import { MetadataLayer } from "./MetadataLayer";
import type { IServerBacking } from "../interfaces/IServerBacking";

export class Reconciler {
  constructor(
    private fileLayer: FileLayer,
    private metadata: MetadataLayer,
    private serverBacking: IServerBacking,
  ) {}

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
        const serverData = await this.serverBacking.get(path);
        if (serverData) {
          await this.fileLayer.writeFile(path, serverData);
          const newHash = await this.hashBuffer(serverData);
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, newHash, mtime ?? 0, 0);
          pulled++;
        } else {
          await this.fileLayer.deleteFile(path);
          deleted++;
        }
      } else if (dbEntry.mtime !== diskInfo.mtime || dbEntry.hash !== diskInfo.hash) {
        const serverData = await this.serverBacking.get(path);
        if (serverData) {
          await this.fileLayer.writeFile(path, serverData);
          const newHash = await this.hashBuffer(serverData);
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, newHash, mtime ?? 0, dbEntry.logNumber);
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
        const serverData = await this.serverBacking.get(path);
        if (serverData) {
          await this.fileLayer.writeFile(path, serverData);
          const newHash = await this.hashBuffer(serverData);
          const mtime = await this.fileLayer.getMtime(path);
          await this.metadata.updateEntryFromFile(path, newHash, mtime ?? 0, entry.logNumber);
          pulled++;
        } else {
          await this.metadata.removeEntry(path);
        }
      }
    }

    return { pulled, deleted };
  }

  private async hashBuffer(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data.slice());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
