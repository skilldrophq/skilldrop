import { Crypto, Effect, Schema } from "effect"
import { CliError, messageFromCause } from "./errors.ts"

const BLOCK_SIZE = 512
const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })

export interface ArchiveEntry {
  readonly path: string
  readonly content: Uint8Array
  readonly mode: number
}

export class ManifestFile extends Schema.Class<ManifestFile>("ManifestFile")({
  path: Schema.String,
  size: Schema.Natural,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
}) {}

export class SkillManifest extends Schema.Class<SkillManifest>("SkillManifest")({
  protocol_version: Schema.Literal(1),
  name: Schema.String.check(Schema.isPattern(/^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)),
  files: Schema.Array(ManifestFile)
}) {}

const writeString = (target: Uint8Array, offset: number, value: string) =>
  target.set(encoder.encode(value), offset)

const octal = (value: number, width: number) =>
  `${value.toString(8).padStart(width - 1, "0")}\0`

const splitTarPath = (path: string): readonly [string, string] => {
  if (encoder.encode(path).byteLength <= 100) return [path, ""]
  const slash = path.lastIndexOf("/")
  if (slash < 1) throw new CliError({ message: `Archive path is too long: ${path}` })
  const prefix = path.slice(0, slash)
  const name = path.slice(slash + 1)
  if (encoder.encode(name).byteLength > 100 || encoder.encode(prefix).byteLength > 155) {
    throw new CliError({ message: `Archive path is too long: ${path}` })
  }
  return [name, prefix]
}

const validPath = (path: string) =>
  path !== "" &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.split("/").some((part) => part === "" || part === "." || part === "..")

export const encodeTar = (entries: ReadonlyArray<ArchiveEntry>): Uint8Array => {
  const chunks: Array<Uint8Array> = []
  for (const entry of entries) {
    if (!validPath(entry.path)) throw new CliError({ message: `Unsafe archive path: ${entry.path}` })
    const [name, prefix] = splitTarPath(entry.path)
    const header = new Uint8Array(BLOCK_SIZE)
    writeString(header, 0, name)
    writeString(header, 100, octal(entry.mode & 0o777, 8))
    writeString(header, 108, octal(0, 8))
    writeString(header, 116, octal(0, 8))
    writeString(header, 124, octal(entry.content.byteLength, 12))
    writeString(header, 136, octal(0, 12))
    header.fill(32, 148, 156)
    header[156] = "0".charCodeAt(0)
    writeString(header, 257, "ustar\0")
    writeString(header, 263, "00")
    if (prefix !== "") writeString(header, 345, prefix)
    const checksum = header.reduce((total, byte) => total + byte, 0)
    writeString(header, 148, octal(checksum, 8))
    chunks.push(header, entry.content)
    const padding = (BLOCK_SIZE - (entry.content.byteLength % BLOCK_SIZE)) % BLOCK_SIZE
    if (padding > 0) chunks.push(new Uint8Array(padding))
  }
  chunks.push(new Uint8Array(BLOCK_SIZE * 2))
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  const archive = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    archive.set(chunk, offset)
    offset += chunk.byteLength
  }
  return archive
}

const tarString = (bytes: Uint8Array) => {
  const end = bytes.indexOf(0)
  return decoder.decode(end === -1 ? bytes : bytes.slice(0, end))
}

const tarNumber = (bytes: Uint8Array) => {
  const value = tarString(bytes).trim()
  if (value === "") return 0
  if (!/^[0-7]+$/.test(value)) throw new CliError({ message: "Archive contains an invalid numeric field" })
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed)) throw new CliError({ message: "Archive entry is too large" })
  return parsed
}

export const decodeTar = (archive: Uint8Array): ReadonlyArray<ArchiveEntry> => {
  const entries: Array<ArchiveEntry> = []
  const paths = new Set<string>()
  for (let offset = 0; offset + BLOCK_SIZE <= archive.byteLength;) {
    const header = archive.slice(offset, offset + BLOCK_SIZE)
    if (header.every((byte) => byte === 0)) break
    const expectedChecksum = tarNumber(header.slice(148, 156))
    const actualChecksum = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0
    )
    if (expectedChecksum !== actualChecksum) throw new CliError({ message: "Archive checksum is invalid" })
    const name = tarString(header.slice(0, 100))
    const prefix = tarString(header.slice(345, 500))
    const entryPath = prefix === "" ? name : `${prefix}/${name}`
    const type = String.fromCharCode(header[156] ?? 0)
    const size = tarNumber(header.slice(124, 136))
    const contentOffset = offset + BLOCK_SIZE
    const paddedSize = Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE
    if (!validPath(entryPath) || contentOffset + paddedSize > archive.byteLength) {
      throw new CliError({ message: "Archive contains an unsafe or truncated path" })
    }
    if (type !== "0" && type !== "\0") throw new CliError({ message: "Archive may contain only regular files" })
    if (paths.has(entryPath)) throw new CliError({ message: `Archive contains duplicate path: ${entryPath}` })
    paths.add(entryPath)
    entries.push({
      path: entryPath,
      content: archive.slice(contentOffset, contentOffset + size),
      mode: tarNumber(header.slice(100, 108)) & 0o777
    })
    offset = contentOffset + paddedSize
  }
  return entries
}

const transform = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

export const gzip = Effect.fn("gzip")(function*(bytes: Uint8Array) {
  return yield* Effect.tryPromise({
    try: () => transform(bytes, new CompressionStream("gzip")),
    catch: (cause) => new CliError({ message: `Could not compress skill: ${messageFromCause(cause)}` })
  })
})

export const gunzip = Effect.fn("gunzip")(function*(bytes: Uint8Array) {
  return yield* Effect.tryPromise({
    try: () => transform(bytes, new DecompressionStream("gzip")),
    catch: () => new CliError({ message: "Downloaded bundle is not valid gzip" })
  })
})

export const sha256 = Effect.fn("sha256")(function*(bytes: Uint8Array) {
  const crypto = yield* Crypto.Crypto
  const digest = yield* crypto.digest("SHA-256", bytes).pipe(
    Effect.mapError((cause) => new CliError({ message: `Could not hash data: ${messageFromCause(cause)}` }))
  )
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
})
