import { expect, test } from "bun:test";
import { InvalidSnapshotError, readSnapshot } from "./snapshot";

const BLOCK = 512;
const encoder = new TextEncoder();

const write = (target: Uint8Array, offset: number, value: string) =>
  target.set(encoder.encode(value), offset);

const octal = (value: number, width: number) => `${value.toString(8).padStart(width - 1, "0")}\0`;

const checksum = (header: Uint8Array) => {
  header.fill(32, 148, 156);
  const value = header.reduce((total, byte) => total + byte, 0);
  write(header, 148, octal(value, 8));
};

const tar = (entries: ReadonlyArray<readonly [string, string]>) => {
  const chunks: Uint8Array[] = [];
  for (const [path, content] of entries) {
    const data = encoder.encode(content);
    const header = new Uint8Array(BLOCK);
    write(header, 0, path);
    write(header, 100, "0000644\0");
    write(header, 124, octal(data.byteLength, 12));
    write(header, 136, octal(0, 12));
    header[156] = "0".charCodeAt(0);
    write(header, 257, "ustar\0");
    checksum(header);
    chunks.push(header, data, new Uint8Array((BLOCK - (data.byteLength % BLOCK)) % BLOCK));
  }
  chunks.push(new Uint8Array(BLOCK * 2));
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const archive = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
};

const gzip = async (data: Uint8Array) =>
  new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

test("reads a valid skill snapshot", async () => {
  const bundle = await gzip(tar([
    ["SKILL.md", "# Review pull requests\n"],
    ["skilldrop.manifest.json", '{"protocol_version":1,"files":[]}'],
  ]));

  const snapshot = await readSnapshot(bundle);

  expect(snapshot.skillMarkdown).toBe("# Review pull requests\n");
  expect(snapshot.manifest).toEqual({ protocol_version: 1, files: [] });
  expect(snapshot.sha256).toHaveLength(64);
});

test("rejects archives without a root SKILL.md", async () => {
  const bundle = await gzip(tar([["nested/SKILL.md", "# Not at root\n"], ["skilldrop.manifest.json", "{}"]]));

  await expect(readSnapshot(bundle)).rejects.toBeInstanceOf(InvalidSnapshotError);
});

test("rejects unsafe archive paths", async () => {
  const bundle = await gzip(tar([["../SKILL.md", "# Unsafe\n"], ["skilldrop.manifest.json", "{}"]]));

  await expect(readSnapshot(bundle)).rejects.toBeInstanceOf(InvalidSnapshotError);
});
