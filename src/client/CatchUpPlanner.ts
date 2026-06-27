import type { AtomicOperation } from "../types";
import { FileLayer } from "./FileLayer";
import { MetadataLayer } from "./MetadataLayer";
import type { IClientBacking } from "../interfaces/IClientBacking";

export class CatchUpPlanner {
  constructor(
    private fileLayer: FileLayer,
    private metadata: MetadataLayer,
    private clientBacking: IClientBacking,
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
        const stream = await this.clientBacking.get(op.path);
        if (stream) {
          await this.fileLayer.writeFile(op.path, stream);
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
