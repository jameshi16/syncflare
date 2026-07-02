/**
 * Interface for the client-side file content retrieval.
 * Implementations fetch the raw content of a file from the remote origin
 * (e.g., over HTTP, from a local cache, or via a platform-specific API).
 */
export interface IClientBacking {
  /**
   * Retrieves the raw content of a file from the remote backing store.
   * @param path - The normalized relative file path.
   * @returns The file content as a readable stream, or null if the file
   * does not exist on the remote store.
   */
  get(path: string): Promise<ReadableStream<Uint8Array> | null>;
}
