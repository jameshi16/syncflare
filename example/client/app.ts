import { SyncflareClient } from "../../src/client/SyncflareClient";
import { FileLayer } from "../../src/client/FileLayer";
import { ClientDatabase } from "./ClientDatabase";
import { HttpClientBacking } from "./HttpClientBacking";
import { planChangeSet } from "../../src/server/ChangeSetPlanner";
import type { LogEntry } from "../../src/types";

const BASE_DIR = process.env.CLIENT_DIR ?? "./example/tmp/synced";
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const CLIENT_DB = process.env.CLIENT_DB ?? "./example/tmp/client.db";

const clientBacking = new HttpClientBacking(SERVER_URL);
const clientDb = new ClientDatabase(CLIENT_DB);
const fileLayer = new FileLayer(BASE_DIR);

const client = new SyncflareClient({
  fileLayer,
  clientBacking,
  clientDb,
  getChangesEndpoint: async (after) => {
    const res = await fetch(`${SERVER_URL}/changes?after=${after}`);
    const json = (await res.json()) as {
      entries: ReturnType<typeof planChangeSet>;
      latest: number;
    };
    return json as unknown as { entries: LogEntry[]; latest: number };
  },
  subscribeEndpoint: SERVER_URL.replace(/^http/, "ws") + "/subscribe",
});

async function main(): Promise<void> {
  console.log("Starting boot reconciliation...");
  const result = await client.boot();
  console.log(
    `Reconciled: ${result.pulled} pulled, ${result.deleted} deleted, ${result.applied} ops applied`,
  );

  console.log("Starting live sync...");
  await fileLayer.startWatch();
  await client.startLiveSync();

  console.log("Syncflare client running. Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await client.stop();
    clientDb.close();
    process.exit(0);
  });
}

main().catch(console.error);
