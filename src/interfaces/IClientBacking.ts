export interface IClientBacking {
  get(path: string): Promise<ReadableStream<Uint8Array> | null>;
}
