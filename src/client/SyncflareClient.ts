import { FileLayer } from "./FileLayer";
import { MetadataLayer } from "./MetadataLayer";
import { Reconciler } from "./Reconciler";
import { CatchUpPlanner } from "./CatchUpPlanner";
import { planChangeSet } from "../server/ChangeSetPlanner";
import { hashStream } from "../util/hash";
import type { IClientBacking } from "../interfaces/IClientBacking";
import type { IClientDatabase } from "../interfaces/IClientDatabase";
import type { LogEntry } from "../types";

export interface SyncflareClientOptions {
  baseDir: string;
  clientBacking: IClientBacking;
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
    this.reconciler = new Reconciler(this.fileLayer, this.metadata, options.clientBacking);
    this.catchUp = new CatchUpPlanner(this.fileLayer, this.metadata, options.clientBacking);
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
      const stream = await this.options.clientBacking.get(event.path);
      if (stream) {
        const [forHash, forWrite] = stream.tee();
        await this.fileLayer.writeFile(event.path, forWrite);
        const hash = await hashStream(forHash);
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
}
