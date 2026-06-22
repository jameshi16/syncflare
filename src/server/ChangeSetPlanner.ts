import type { LogEntry, AtomicOperation } from "../types";

export function planChangeSet(logEntries: LogEntry[]): AtomicOperation[] {
  const unordered: AtomicOperation[] = logEntries.map((e) => ({
    op: e.op,
    path: e.path,
    hash: e.hash,
  }));
  return optimizeAtomic(unordered);
}

function optimizeAtomic(ops: AtomicOperation[]): AtomicOperation[] {
  const pathOps = new Map<string, AtomicOperation[]>();

  for (const op of ops) {
    const list = pathOps.get(op.path) ?? [];
    list.push(op);
    pathOps.set(op.path, list);
  }

  const result: AtomicOperation[] = [];

  for (const [, list] of pathOps) {
    const optimized = reducePathOps(list);
    result.push(...optimized);
  }

  return result;
}

function reducePathOps(ops: AtomicOperation[]): AtomicOperation[] {
  if (ops.length === 0) return [];

  const reduced: AtomicOperation[] = [];

  for (const op of ops) {
    if (op.op === "DELETE") {
      const lastIndex = reduced.length - 1;
      if (lastIndex >= 0 && reduced[lastIndex]!.op === "CREATE") {
        reduced.pop();
      } else {
        reduced.push(op);
      }
    } else if (op.op === "REPLACE") {
      const lastIndex = reduced.length - 1;
      if (lastIndex >= 0 && reduced[lastIndex]!.op === "CREATE") {
        reduced[lastIndex] = { ...op, op: "CREATE" as const };
      } else if (lastIndex >= 0 && reduced[lastIndex]!.op === "REPLACE") {
        reduced[lastIndex] = op;
      } else {
        reduced.push(op);
      }
    } else {
      reduced.push(op);
    }
  }

  if (reduced.length === 0) return [];
  const lastOp = reduced[reduced.length - 1]!;
  if (lastOp.op === "DELETE") return [];
  if (lastOp.op === "REPLACE" || lastOp.op === "CREATE") return [lastOp];

  return [];
}
