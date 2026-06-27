import { ServerDatabase } from "./ServerDatabase";
import { ServerBacking } from "./ServerBacking";
import { planChangeSet } from "../../src/server/ChangeSetPlanner";
import type { LogEntry } from "../../src/types";
import { hashStream } from "../../src/util/hash";
import type { ServerWebSocket } from "bun";

const DB_PATH = process.env.SERVER_DB ?? "./example/tmp/server.db";
const BACKING_DIR = process.env.SERVER_BACKING ?? "./example/tmp/remote";

const db = new ServerDatabase(DB_PATH);
const backing = new ServerBacking(BACKING_DIR);

const wsClients = new Set<ServerWebSocket<undefined>>();

function broadcastLogEntry(entry: LogEntry): void {
  const msg = JSON.stringify({ type: "log_entry", entry });
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      wsClients.delete(ws);
    }
  }
}

async function handleUpload(req: Request): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return new Response("Missing file", { status: 400 });
  }

  const path = file.name;
  const stream = file.stream();
  const [hashBranch, storeBranch] = stream.tee();
  const hash = await hashStream(hashBranch);
  const timestamp = Date.now();

  await backing.put(path, storeBranch);
  const entry = await db.append("CREATE", path, hash, timestamp);
  broadcastLogEntry(entry);

  return Response.json(entry, { status: 201 });
}

async function handlePutFile(req: Request, path: string): Promise<Response> {
  const stream = req.body!;
  const [hashBranch, storeBranch] = stream.tee();
  const hash = await hashStream(hashBranch);
  const timestamp = Date.now();

  await backing.put(path, storeBranch);
  const entry = await db.append("REPLACE", path, hash, timestamp);
  broadcastLogEntry(entry);

  return Response.json(entry);
}

async function handleDeleteFile(path: string): Promise<Response> {
  const timestamp = Date.now();
  await backing.delete(path);
  const entry = await db.append("DELETE", path, "", timestamp);
  broadcastLogEntry(entry);

  return Response.json(entry);
}

async function handleGetFile(path: string): Promise<Response> {
  const stream = await backing.get(path);
  if (!stream) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(stream);
}

async function handleChanges(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const after = Number(url.searchParams.get("after") ?? "0");
  const entries = await db.range(after);
  const ops = planChangeSet(entries);
  const latest = await db.latest();

  return Response.json({ entries: ops, latest });
}

function handleWebSocket(req: Request): Response {
  const success = server.upgrade(req);
  if (success) {
    return new Response(null, { status: 101 });
  }
  return new Response("WebSocket upgrade failed", { status: 400 });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),

  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "POST" && url.pathname === "/upload") {
      return handleUpload(req);
    }

    if (method === "GET" && url.pathname === "/changes") {
      return handleChanges(req);
    }

    if (url.pathname.startsWith("/files/")) {
      const path = url.pathname.slice("/files/".length);

      if (method === "PUT") {
        return handlePutFile(req, path);
      }
      if (method === "DELETE") {
        return handleDeleteFile(path);
      }
      if (method === "GET") {
        return handleGetFile(path);
      }
    }

    if (url.pathname === "/subscribe") {
      return handleWebSocket(req);
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message(_ws, _message) {
      // server normally doesn't receive messages
    },
  },
});

console.log(`Server running on http://localhost:${server.port}`);
