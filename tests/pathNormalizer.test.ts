import { test, expect } from "bun:test";
import { normalizePath, joinAndNormalize } from "../src/util/pathNormalizer";

test("normalizePath removes leading and trailing slashes", () => {
  expect(normalizePath("/foo/bar/")).toBe("foo/bar");
});

test("normalizePath converts backslashes to forward slashes", () => {
  expect(normalizePath("foo\\bar\\baz")).toBe("foo/bar/baz");
});

test("normalizePath handles empty string", () => {
  expect(normalizePath("")).toBe("");
});

test("normalizePath handles root path", () => {
  expect(normalizePath("/")).toBe("");
});

test("joinAndNormalize joins segments and normalizes", () => {
  expect(joinAndNormalize("/base/", "/sub/", "file.txt")).toBe("base/sub/file.txt");
});
