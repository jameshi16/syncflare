export const OP_KINDS = ["CREATE", "REPLACE", "DELETE"] as const;
export type OpKind = (typeof OP_KINDS)[number];

export interface LogEntry {
  id: number;
  op: OpKind;
  path: string;
  hash: string;
  timestamp: number;
}

export interface FileEntry {
  path: string;
  hash: string;
  mtime: number;
  logNumber: number;
}

export interface ClientState {
  logNumber: number;
  entries: FileEntry[];
}

export interface AtomicOperation {
  op: OpKind;
  path: string;
  hash: string;
}
