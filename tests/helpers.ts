import type { FileEntry } from "../src/types";

export function mapRowToFileEntry(row: Record<string, unknown>): FileEntry {
  return {
    path: row.path as string,
    hash: row.hash as string,
    mtime: row.mtime as number,
    logNumber: row.log_number as number,
  };
}

export async function decodeOrNull(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string | null> {
  if (stream === null) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const data = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(data);
}

export function stringToStream(content: string): ReadableStream<Uint8Array> {
  const data = new TextEncoder().encode(content);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}
