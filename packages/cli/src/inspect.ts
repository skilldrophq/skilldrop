import { Effect } from "effect";
import type { SnapshotMetadata } from "./api.ts";
import type { ArchiveEntry } from "./archive.ts";
import { CliError } from "./errors.ts";
import { verifySkillBundle } from "./skill.ts";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit: "KiB" | "MiB" = "KiB";
  if (value >= 1024) {
    value /= 1024;
    unit = "MiB";
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
};

const isExecutable = (mode: number) => (mode & 0o111) !== 0;
const shortHash = (hash: string) => `${hash.slice(0, 7)}…`;

export const verifySnapshot = Effect.fn("verifySnapshot")(function* (
  metadata: SnapshotMetadata,
  compressed: Uint8Array,
) {
  const verified = yield* verifySkillBundle(compressed, metadata.sha256);
  if (JSON.stringify(verified.manifest) !== JSON.stringify(metadata.manifest)) {
    return yield* new CliError({
      message: "Bundle manifest does not match snapshot metadata",
    });
  }
  return verified;
});

export const renderSnapshotInspection = (
  metadata: SnapshotMetadata,
  files: ReadonlyArray<ArchiveEntry>,
  options: { readonly includeInstallCommand?: boolean } = {},
) => {
  const entriesByPath = new Map(files.map((file) => [file.path, file]));
  const executableFiles = files.filter((file) => isExecutable(file.mode));
  const lines = [
    `Snapshot ${metadata.id}`,
    `  skill: ${metadata.manifest.name}`,
    `  protocol: ${metadata.manifest.protocol_version}`,
    `  uploaded: ${metadata.uploaded_at}`,
    `  bundle: ${formatBytes(metadata.size)} (${metadata.size} bytes)`,
    `  bundle sha256: ${shortHash(metadata.sha256)}`,
    "  integrity: verified",
    "",
    `Files (${metadata.manifest.files.length})`,
  ];

  for (const file of metadata.manifest.files) {
    const entry = entriesByPath.get(file.path)!;
    const executable = isExecutable(entry.mode) ? " executable" : "";
    lines.push(`  ${file.path}`);
    lines.push(`    size: ${formatBytes(file.size)} (${file.size} bytes)`);
    lines.push(`    sha256: ${shortHash(file.sha256)}`);
    lines.push(
      `    mode: ${entry.mode.toString(8).padStart(4, "0")}${executable}`,
    );
  }

  lines.push("");
  lines.push(`Executable files (${executableFiles.length})`);
  if (executableFiles.length === 0) {
    lines.push("  none");
  } else {
    lines.push("  warning: review these files before installing");
    for (const file of executableFiles) lines.push(`  ${file.path}`);
  }
  if (options.includeInstallCommand !== false) {
    lines.push("");
    lines.push(`Install with: sk install ${metadata.id}`);
  }
  return lines.join("\n");
};
