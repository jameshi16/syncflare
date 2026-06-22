export interface IClientBacking {
  get(path: string): Promise<Uint8Array | null>;
}
