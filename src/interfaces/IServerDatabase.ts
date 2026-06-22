import type { LogEntry, OpKind } from "../types";

/**
 * Interface for the server-side operation log database.
 * Implementations maintain an append-only log of file operations
 * that clients poll to discover and apply remote changes.
 */
export interface IServerDatabase {
  /**
   * Appends a new operation to the log.
   * @param op - The operation kind (CREATE, REPLACE, or DELETE).
   * @param path - The normalized relative file path.
   * @param hash - The SHA-256 hash of the file content.
   * @param timestamp - The operation timestamp (epoch milliseconds).
   * @returns The newly created log entry with its assigned ID.
   */
  append(op: OpKind, path: string, hash: string, timestamp: number): Promise<LogEntry>;

  /**
   * Returns all log entries with IDs greater than the given value.
   * Used by clients to catch up on operations they missed.
   * @param after - The last known log entry ID (exclusive lower bound).
   * @returns An array of log entries with IDs > after.
   */
  range(after: number): Promise<LogEntry[]>;

  /**
   * Returns the latest (highest) log entry ID.
   * Used by clients to determine if they are behind.
   * @returns The latest log entry ID, or 0 if no entries exist.
   */
  latest(): Promise<number>;
}
