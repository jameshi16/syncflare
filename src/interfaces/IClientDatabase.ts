import type { FileEntry } from "../types";

/**
 * Interface for the client-side database that stores file metadata.
 * Implementations must persist file entries (path, hash, mtime, logNumber)
 * and track the last processed server log position for catch-up sync.
 */
export interface IClientDatabase {
  /**
   * Retrieves the metadata entry for a file at the given path.
   * @param path - The normalized relative file path.
   * @returns The file entry, or null if not found.
   */
  getEntry(path: string): Promise<FileEntry | null>;

  /**
   * Inserts or updates a file metadata entry.
   * @param entry - The file entry to upsert.
   */
  upsertEntry(entry: FileEntry): Promise<void>;

  /**
   * Removes the metadata entry for a file at the given path.
   * @param path - The normalized relative file path.
   */
  removeEntry(path: string): Promise<void>;

  /**
   * Returns all stored file entries.
   * @returns An array of all file entries in the database.
   */
  allEntries(): Promise<FileEntry[]>;

  /**
   * Returns the current log number (last processed server log position).
   * @returns The current log number.
   */
  getLogNumber(): Promise<number>;

  /**
   * Sets the current log number.
   * @param n - The new log number to store.
   */
  setLogNumber(n: number): Promise<void>;
}
