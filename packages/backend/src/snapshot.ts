import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import { Manifest } from "./models";

const TAR_BLOCK_SIZE = 512;

export const MAX_COMPRESSED_BUNDLE_BYTES = 10 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BUNDLE_BYTES = 32 * 1024 * 1024;
export const MAX_FILES = 256;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MANIFEST_PATH = "skilldrop.manifest.json";

export class InvalidSnapshotError extends Data.TaggedError("InvalidSnapshotError")<{
  readonly message: string;
}> {
  constructor(message: string) {
    super({ message });
  }
}

export interface Snapshot {
  readonly manifest: Manifest;
  readonly sha256: string;
  readonly skillMarkdown: string;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

const isZeroBlock = (bytes: Uint8Array) => bytes.every((byte) => byte === 0);

const tarString = (bytes: Uint8Array) => {
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.slice(0, end));
};

const tarSize = (bytes: Uint8Array) => {
  const value = tarString(bytes).trim();
  if (value === "") return 0;
  if (!/^[0-7]+$/.test(value)) throw new InvalidSnapshotError("Invalid tar entry size");
  const size = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(size)) throw new InvalidSnapshotError("Tar entry is too large");
  return size;
};

const validHeaderChecksum = (header: Uint8Array) => {
  const expected = tarSize(header.slice(148, 156));
  let actual = 0;
  for (let index = 0; index < TAR_BLOCK_SIZE; index += 1) {
    actual += index >= 148 && index < 156 ? 32 : header[index]!;
  }
  return expected === actual;
};

const validPath = (path: string) =>
  path !== "" &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.split("/").some((part) => part === "" || part === "." || part === "..");

const collectDecompressed = async (compressed: Uint8Array) => {
  if (compressed.byteLength === 0 || compressed.byteLength > MAX_COMPRESSED_BUNDLE_BYTES) {
    throw new InvalidSnapshotError("Bundle exceeds the compressed size limit");
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  } catch {
    throw new InvalidSnapshotError("Bundle is not a gzip archive");
  }

  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for await (const chunk of stream) {
      length += chunk.byteLength;
      if (length > MAX_UNCOMPRESSED_BUNDLE_BYTES) {
        throw new InvalidSnapshotError("Bundle exceeds the uncompressed size limit");
      }
      chunks.push(chunk);
    }
  } catch (cause) {
    if (cause instanceof InvalidSnapshotError) throw cause;
    throw new InvalidSnapshotError("Bundle is not a valid gzip archive");
  }

  const archive = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return archive;
};

const sha256 = async (bytes: Uint8Array) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const readSnapshot = async (compressed: Uint8Array): Promise<Snapshot> => {
  const archive = await collectDecompressed(compressed);
  const files = new Map<string, Uint8Array>();
  let skillMarkdown: string | undefined;
  let manifest: Manifest | undefined;
  let foundEnd = false;

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= archive.byteLength;) {
    const header = archive.slice(offset, offset + TAR_BLOCK_SIZE);
    if (isZeroBlock(header)) {
      const remainder = archive.slice(offset);
      if (
        remainder.byteLength < TAR_BLOCK_SIZE * 2 ||
        !isZeroBlock(remainder.slice(TAR_BLOCK_SIZE, TAR_BLOCK_SIZE * 2)) ||
        !isZeroBlock(remainder)
      ) {
        throw new InvalidSnapshotError("Archive has an invalid end marker");
      }
      foundEnd = true;
      break;
    }
    if (!validHeaderChecksum(header)) {
      throw new InvalidSnapshotError("Archive contains an entry with an invalid checksum");
    }

    const name = tarString(header.slice(0, 100));
    const prefix = tarString(header.slice(345, 500));
    const path = prefix === "" ? name : `${prefix}/${name}`;
    const type = String.fromCharCode(header[156] ?? 0);
    const size = tarSize(header.slice(124, 136));
    const contentOffset = offset + TAR_BLOCK_SIZE;
    const paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

    if (!validPath(path) || contentOffset + paddedSize > archive.byteLength) {
      throw new InvalidSnapshotError("Archive contains an unsafe or truncated path");
    }
    if (type !== "0" && type !== "\0") {
      throw new InvalidSnapshotError("Archive may contain only regular files");
    }
    if (size > MAX_FILE_BYTES) throw new InvalidSnapshotError("Archive contains an oversized file");
    if (files.has(path)) throw new InvalidSnapshotError("Archive contains duplicate paths");
    const content = archive.slice(contentOffset, contentOffset + size);
    files.set(path, content);
    if (path === "SKILL.md") {
      try {
        skillMarkdown = decoder.decode(content);
      } catch {
        throw new InvalidSnapshotError("SKILL.md must be valid UTF-8");
      }
    }
    if (path === MANIFEST_PATH) {
      try {
        manifest = Schema.decodeUnknownSync(Manifest)(JSON.parse(decoder.decode(content)));
      } catch {
        throw new InvalidSnapshotError(`${MANIFEST_PATH} does not match protocol version 1`);
      }
    }
    if (files.size > MAX_FILES) throw new InvalidSnapshotError("Archive contains too many files");
    offset = contentOffset + paddedSize;
  }

  if (!foundEnd) throw new InvalidSnapshotError("Archive has no end marker");
  if (skillMarkdown === undefined || skillMarkdown.trim() === "") {
    throw new InvalidSnapshotError("Archive must contain a non-empty root SKILL.md");
  }
  if (manifest === undefined) {
    throw new InvalidSnapshotError("Archive must contain a root skilldrop.manifest.json");
  }

  const bundledFiles = new Map(files);
  bundledFiles.delete(MANIFEST_PATH);
  if (manifest.files.length !== bundledFiles.size) {
    throw new InvalidSnapshotError("Archive file list does not match its manifest");
  }
  const manifestPaths = new Set<string>();
  for (const expected of manifest.files) {
    if (!validPath(expected.path) || expected.path === MANIFEST_PATH) {
      throw new InvalidSnapshotError("Manifest contains an invalid file path");
    }
    if (manifestPaths.has(expected.path)) {
      throw new InvalidSnapshotError("Manifest contains duplicate file paths");
    }
    manifestPaths.add(expected.path);
    const content = bundledFiles.get(expected.path);
    if (content === undefined || content.byteLength !== expected.size) {
      throw new InvalidSnapshotError(`File does not match its manifest: ${expected.path}`);
    }
    if ((await sha256(content)) !== expected.sha256) {
      throw new InvalidSnapshotError(`File checksum is invalid: ${expected.path}`);
    }
  }

  return { skillMarkdown, manifest, sha256: await sha256(compressed) };
};
