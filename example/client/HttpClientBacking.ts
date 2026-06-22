import type { IClientBacking } from "../../src/interfaces/IClientBacking";

export class HttpClientBacking implements IClientBacking {
  constructor(private baseUrl: string) {}

  async get(path: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(`${this.baseUrl}/files/${path}`);
      if (!res.ok) return null;
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
}
