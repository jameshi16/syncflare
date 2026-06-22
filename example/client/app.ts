import { SyncflareClient } from "../../src/client/SyncflareClient";
import { ServerBacking } from "../server/ServerBacking";
import { ClientDatabase } from "./ClientDatabase";
import { planChangeSet } from "../../src/server/ChangeSetPlanner";

const BASE_DIR = process.env.CLIENT_DIR ?? "./synced";
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const BACKING_DIR = process.env.SERVER_BACKING ?? "./remote";
const CLIENT_DB = process.env.CLIENT_DB ?? "client.db";

const serverBacking = new ServerBacking(BACKING_DIR);
const clientDb = new ClientDatabase(CLIENT_DB);

const client = new SyncflareClient({
  baseDir: BASE_DIR,
  serverBacking,
  clientDb,
  getChangesEndpoint: async (after) => {
    const res = await fetch(`${SERVER_URL}/changes?after=${after}`);
    const json = (await res.json()) as {
      entries: ReturnType<typeof planChangeSet>;
      latest: number;
    };
    return json as unknown as { entries: import("../../src/types").LogEntry[]; latest: number };
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
  await client.fileLayer.startWatch();
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
