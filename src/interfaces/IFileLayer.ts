/**
 * A file system change event emitted by the file watcher.
 * Mirrors the common add / change / unlink lifecycle.
 */
export interface FileEvent {
  /** The kind of change: file added, modified, or deleted. */
  type: "add" | "change" | "unlink";
  /** The normalized relative path of the affected file. */
  path: string;
}

/**
 * Interface for the client-side file system layer.
 * Implementations provide file I/O, directory scanning, and file watching
 * capabilities. The package ships a default Node/Bun implementation
 * (FileLayer) using chokidar and node:fs; alternative implementations
 * can target platforms like Tauri or custom storage backends.
 */
export interface IFileLayer {
  /**
   * Registers a handler for file system events (add / change / unlink).
   * Only one handler may be registered at a time; subsequent calls replace
   * the previous handler.
   * @param handler - A callback invoked on each file system event.
   */
  onEvent(handler: (event: FileEvent) => void): void;

  /**
   * Starts watching the base directory for file changes.
   * The registered event handler (set via {@link onEvent}) will be invoked
   * on each add / change / unlink event.
   */
  startWatch(): Promise<void>;

  /**
   * Stops the file system watcher if it is running. Further events will not
   * be delivered.
   */
  stopWatch(): Promise<void>;

  /**
   * Recursively scans all files under the base directory and returns their
   * SHA-256 hashes and modification times.
   *
   * When `knownEntries` is provided, entries whose mtime matches the cached
   * value are returned with the cached hash directly, skipping a full file
   * read + hash for performance.
   * @param knownEntries - Optional map of previously-known file metadata
   * (path → { hash, mtime }) used to short-circuit re-hashing of unchanged
   * files.
   * @returns A map of relative file paths to their hash and mtime.
   */
  scanAllFiles(
    knownEntries?: Map<string, { hash: string; mtime: number }>,
  ): Promise<Map<string, { hash: string; mtime: number }>>;

  /**
   * Reads a file and returns its content as a readable stream.
   * @param path - The normalized relative file path.
   * @returns A readable stream of the file content, or null if the file
   * does not exist.
   */
  readFile(path: string): Promise<ReadableStream<Uint8Array> | null>;

  /**
   * Writes a file from a readable stream, creating parent directories as
   * needed. Overwrites the file if it already exists.
   * @param path - The normalized relative file path.
   * @param stream - A readable stream providing the file content to write.
   */
  writeFile(path: string, stream: ReadableStream<Uint8Array>): Promise<void>;

  /**
   * Deletes a file. No-op if the file does not exist.
   * @param path - The normalized relative file path.
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Returns the modification time (epoch milliseconds) of a file.
   * @param path - The normalized relative file path.
   * @returns The modification time as epoch ms, or null if the file does
   * not exist.
   */
  getMtime(path: string): Promise<number | null>;
}
