import { test, expect, describe } from "bun:test";
import { planChangeSet } from "../src/server/ChangeSetPlanner";
import type { LogEntry } from "../src/types";

function entry(id: number, op: "CREATE" | "REPLACE" | "DELETE", path: string, hash = ""): LogEntry {
  return { id, op, path, hash, timestamp: id };
}

describe("ChangeSetPlanner", () => {
  test("empty list produces empty plan", () => {
    expect(planChangeSet([])).toEqual([]);
  });

  test("single CREATE produces that CREATE", () => {
    const result = planChangeSet([entry(1, "CREATE", "a.txt", "abc")]);
    expect(result).toEqual([{ op: "CREATE", path: "a.txt", hash: "abc" }]);
  });

  test("CREATE then DELETE for same path cancels out", () => {
    const result = planChangeSet([entry(1, "CREATE", "a.txt", "abc"), entry(2, "DELETE", "a.txt")]);
    expect(result).toEqual([]);
  });

  test("consecutive REPLACE collapses to last", () => {
    const result = planChangeSet([
      entry(1, "REPLACE", "a.txt", "v1"),
      entry(2, "REPLACE", "a.txt", "v2"),
    ]);
    expect(result).toEqual([{ op: "REPLACE", path: "a.txt", hash: "v2" }]);
  });

  test("CREATE then REPLACE becomes CREATE with last hash", () => {
    const result = planChangeSet([
      entry(1, "CREATE", "a.txt", "v1"),
      entry(2, "REPLACE", "a.txt", "v2"),
    ]);
    expect(result).toEqual([{ op: "CREATE", path: "a.txt", hash: "v2" }]);
  });

  test("CREATE, REPLACE, DELETE for same path produces nothing", () => {
    const result = planChangeSet([
      entry(1, "CREATE", "a.txt", "v1"),
      entry(2, "REPLACE", "a.txt", "v2"),
      entry(3, "DELETE", "a.txt"),
    ]);
    expect(result).toEqual([]);
  });

  test("REPLACE then DELETE for same path produces DELETE", () => {
    const result = planChangeSet([entry(1, "REPLACE", "a.txt", "v1"), entry(2, "DELETE", "a.txt")]);
    expect(result).toEqual([]);
  });

  test("different paths are independent", () => {
    const result = planChangeSet([
      entry(1, "CREATE", "a.txt", "abc"),
      entry(2, "CREATE", "b.txt", "def"),
      entry(3, "DELETE", "a.txt"),
    ]);
    expect(result).toEqual([{ op: "CREATE", path: "b.txt", hash: "def" }]);
  });

  test("complex interleaved paths", () => {
    const result = planChangeSet([
      entry(1, "CREATE", "a.txt", "a1"),
      entry(2, "CREATE", "b.txt", "b1"),
      entry(3, "REPLACE", "a.txt", "a2"),
      entry(4, "DELETE", "a.txt"),
      entry(5, "REPLACE", "b.txt", "b2"),
    ]);
    expect(result).toEqual([{ op: "CREATE", path: "b.txt", hash: "b2" }]);
  });
});
