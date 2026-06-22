import type { AtomicOperation } from "../types";
import { FileLayer } from "./FileLayer";
import { MetadataLayer } from "./MetadataLayer";
import type { IServerBacking } from "../interfaces/IServerBacking";

export class CatchUpPlanner {
  constructor(
    private fileLayer: FileLayer,
    private metadata: MetadataLayer,
    private serverBacking: IServerBacking,
  ) {}

  async apply(ops: AtomicOperation[], newLogNumber: number): Promise<void> {
    await Promise.all(ops.map((op) => this.applySingle(op)));

    const now = Date.now();

    for (const op of ops) {
      if (op.op === "DELETE") {
        await this.metadata.removeEntry(op.path);
      } else {
        const mtime = await this.fileLayer.getMtime(op.path);
        await this.metadata.updateEntryFromFile(op.path, op.hash, mtime ?? now, newLogNumber);
      }
    }

    await this.metadata.setLogNumber(newLogNumber);
  }

  private async applySingle(op: AtomicOperation): Promise<void> {
    switch (op.op) {
      case "CREATE":
      case "REPLACE": {
        const data = await this.serverBacking.get(op.path);
        if (data) {
          await this.fileLayer.writeFile(op.path, data);
        }
        break;
      }
      case "DELETE": {
        await this.fileLayer.deleteFile(op.path);
        break;
      }
    }
  }
}
