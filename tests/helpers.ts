import type { FileEntry } from "../src/types";

export function mapRowToFileEntry(row: Record<string, unknown>): FileEntry {
  return {
    path: row.path as string,
    hash: row.hash as string,
    mtime: row.mtime as number,
    logNumber: row.log_number as number,
  };
}

export function decodeOrNull(data: Uint8Array | null): string | null {
  if (data === null) return null;
  return new TextDecoder().decode(data);
}
