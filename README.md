# Syncflare

Syncflare is a local-first file synchronization engine designed to be entirely storage-provider agnostic.

## Vision

Imagine a system composed of a managed database server and a serverless application backend that serves two distinct user groups:

* **Party A (Producers):** A large pool of users who upload files through a web interface, which updates the managed database via the serverless application.
* **Party B (Consumers):** Users who need to keep a local, volatile filesystem continuously synchronized with the central system.

The synchronization engine must reliably handle three core local filesystem scenarios:
1.  **Offline changes:** The user creates, updates, or deletes files while the client app is offline.
2.  **Online changes:** The user creates, updates, or deletes files while the client app is online.
3.  **Stale boot state:** The user boots the app after the server state has changed during the app's downtime.

To accurately reconcile the local filesystem with the central server, Syncflare combines **Conflict-Free Replicated Data Types (CRDTs)** with **filesystem notification events**. 

Because this package is database-agnostic, developers can implement their own database adapter against a standard provider interface, which serves as the single source of truth for file metadata.

---

## How It Works

The client operates across two synchronized layers:

* **File Layer:** Combines a live, active filesystem watcher with a fast boot-time reconciliation scan to track offline modifications on the client.
* **Metadata Layer:** Tracks file states (such as cryptographic hashes and timestamps) and syncs them with the server utilizing CRDT principles.

### Boot-Time Reconciliation

During startup, the engine scans all files within the target directory to detect:
* Missing files
* New files
* Updated files

This scan optimizes performance by comparing modified timestamps first, followed by file hashes tracked in the local client database (SQLite). 

To enforce server authority, locally created "new" files are discarded entirely, while missing or updated files are re-pulled from the server.

### Catch-Up to Latest Log Number

Following the boot-time reconciliation, the client submits its latest known log number to the server. The server then calculates the minimal changeset required to transition the client to the current server state.

Valid operations in this changeset include:
* `CREATE`
* `REPLACE`
* `DELETE`

The engine optimizes this changeset by collapsing redundant operations. For example, if a `CREATE` operation is followed by a `DELETE` within the same state delta, both are omitted entirely. This optimization pass produces an execution plan composed of **atomic operations** that can safely run in parallel without conflicts. 

Once the plan is generated, the client executes the changeset to catch up to the central state.

---

## API

The package exposes three core interfaces that must be implemented to establish synchronization:

* `IServerDatabase`: Handles appending to an append-only operations table server-side and retrieves specific ranges of log entries.
* `IServerBacking`: The underlying storage engine that serves the actual files corresponding to the metadata in `IServerDatabase`.
* `IClientDatabase`: Manages the local client state, tracks file metadata, and stores the current synchronization log number.

> **Note:** The package assumes a standard local filesystem capable of dispatching reliable file-change events (e.g., using Linux `inotify` or abstraction libraries like `chokidar`).

---

## Example

The reference implementation inside the `example/` directory demonstrates:

* `IServerDatabase` implemented via SQLite (`server.db`).
* `IServerBacking` acting as a mock local object store, represented by the `./remote/` directory.
* `IClientDatabase` implemented via SQLite (`client.db`).

In this example, the "server" is driven by a lightweight Bun HTTP server simulating a serverless API, while the "client" is a Bun-powered application executing the boot-time reconciliation and log catch-up processes detailed above.
