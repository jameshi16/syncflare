/**
 * Interface for server-side file storage (blob/object store).
 * Implementations provide raw read/write/delete access to file contents,
 * typically backed by a remote storage service or local filesystem.
 */
export interface IServerBacking {
  /**
   * Retrieves the raw content of a file from the backing store.
   * @param path - The normalized relative file path.
   * @returns The file content as a byte array, or null if not found.
   */
  get(path: string): Promise<Uint8Array | null>;

  /**
   * Stores file content in the backing store.
   * @param path - The normalized relative file path.
   * @param data - The file content to store.
   */
  put(path: string, data: Uint8Array): Promise<void>;

  /**
   * Deletes a file from the backing store.
   * @param path - The normalized relative file path.
   */
  delete(path: string): Promise<void>;
}
