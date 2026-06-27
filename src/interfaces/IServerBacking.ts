/**
 * Interface for server-side file storage (blob/object store).
 * Implementations provide raw read/write/delete access to file contents,
 * typically backed by a remote storage service or local filesystem.
 */
export interface IServerBacking {
  /**
   * Retrieves the raw content of a file from the backing store.
   * @param path - The normalized relative file path.
   * @returns The file content as a readable stream, or null if not found.
   */
  get(path: string): Promise<ReadableStream<Uint8Array> | null>;

  /**
   * Stores file content in the backing store.
   * @param path - The normalized relative file path.
   * @param stream - The file content to store as a readable stream.
   */
  put(path: string, stream: ReadableStream<Uint8Array>): Promise<void>;

  /**
   * Deletes a file from the backing store.
   * @param path - The normalized relative file path.
   */
  delete(path: string): Promise<void>;
}
