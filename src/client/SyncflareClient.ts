import { FileLayer } from "./FileLayer";
import { MetadataLayer } from "./MetadataLayer";
import { Reconciler } from "./Reconciler";
import { CatchUpPlanner } from "./CatchUpPlanner";
import { planChangeSet } from "../server/ChangeSetPlanner";
import type { IServerBacking } from "../interfaces/IServerBacking";
import type { IClientDatabase } from "../interfaces/IClientDatabase";
import type { LogEntry } from "../types";

export interface SyncflareClientOptions {
  baseDir: string;
  serverBacking: IServerBacking;
  clientDb: IClientDatabase;
  getChangesEndpoint: (after: number) => Promise<{ entries: LogEntry[]; latest: number }>;
  subscribeEndpoint?: string;
}

export class SyncflareClient {
  public readonly fileLayer: FileLayer;
  public readonly metadata: MetadataLayer;
  public readonly reconciler: Reconciler;
  public readonly catchUp: CatchUpPlanner;
  private ws: WebSocket | null = null;

  constructor(private options: SyncflareClientOptions) {
    this.fileLayer = new FileLayer(options.baseDir);
    this.metadata = new MetadataLayer(options.clientDb);
    this.reconciler = new Reconciler(this.fileLayer, this.metadata, options.serverBacking);
    this.catchUp = new CatchUpPlanner(this.fileLayer, this.metadata, options.serverBacking);
  }

  async boot(): Promise<{ pulled: number; deleted: number; applied: number }> {
    const { pulled, deleted } = await this.reconciler.run();

    const logNumber = await this.metadata.getLogNumber();
    const raw = await this.options.getChangesEndpoint(logNumber);
    const ops = planChangeSet(raw.entries);
    const latest = raw.latest;
    await this.catchUp.apply(ops, latest);

    return { pulled, deleted, applied: ops.length };
  }

  async startLiveSync(): Promise<void> {
    const subscribeUrl = this.options.subscribeEndpoint;
    if (!subscribeUrl) return;

    if (typeof globalThis !== "undefined" && "WebSocket" in globalThis) {
      this.ws = new WebSocket(subscribeUrl);

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "log_entry") {
            const ops = planChangeSet([data.entry]);
            await this.catchUp.apply(ops, data.entry.id);
          }
        } catch {
          // ignore malformed messages
        }
      };
    }

    this.fileLayer.onEvent(async (event) => {
      const serverData = await this.options.serverBacking.get(event.path);
      if (serverData) {
        await this.fileLayer.writeFile(event.path, serverData);
        const hash = await this.hashBuffer(serverData);
        const mtime = await this.fileLayer.getMtime(event.path);
        await this.metadata.updateEntryFromFile(
          event.path,
          hash,
          mtime ?? 0,
          await this.metadata.getLogNumber(),
        );
      } else {
        await this.fileLayer.deleteFile(event.path);
        await this.metadata.removeEntry(event.path);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    await this.fileLayer.stopWatch();
  }

  private async hashBuffer(data: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", data.slice());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
}
