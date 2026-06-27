import { test, expect } from "bun:test";
import { hashBuffer, hashString, hashStream } from "../src/util/hash";
import { stringToStream } from "./helpers";

test("hashBuffer produces consistent SHA-256 hex", async () => {
  const data = new Uint8Array([104, 101, 108, 108, 111]);
  const result = await hashBuffer(data);
  expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("hashString produces same as hashBuffer of encoded string", async () => {
  const str = "hello";
  const fromString = await hashString(str);
  const fromBuffer = await hashBuffer(new TextEncoder().encode(str));
  expect(fromString).toBe(fromBuffer);
});

test("different inputs produce different hashes", async () => {
  const a = await hashString("foo");
  const b = await hashString("bar");
  expect(a).not.toBe(b);
});

test("hashStream produces same hash as hashBuffer", async () => {
  const data = "hello";
  const streamHash = await hashStream(stringToStream(data));
  const bufferHash = await hashBuffer(new TextEncoder().encode(data));
  expect(streamHash).toBe(bufferHash);
});

test("hashStream handles multiple chunks", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hel"));
      controller.enqueue(new TextEncoder().encode("lo"));
      controller.close();
    },
  });
  const result = await hashStream(stream);
  expect(result).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});
