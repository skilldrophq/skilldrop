import { Effect } from "effect";
import type { SnapshotMetadata } from "./api.ts";
import type { ArchiveEntry } from "./archive.ts";
import { CliError } from "./errors.ts";
import { verifySkillBundle } from "./skill.ts";
import {
  commandHint,
  heading,
  rows,
  section,
  ui,
  warningMessage,
} from "./ui.ts";

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
    heading("Snapshot", metadata.id),
    ...rows([
      ["skill", ui.bold(metadata.manifest.name)],
      ["protocol", String(metadata.manifest.protocol_version)],
      ["uploaded", metadata.uploaded_at],
      [
        "bundle",
        `${formatBytes(metadata.size)} ${ui.dim(`(${metadata.size} bytes)`)}`,
      ],
      ["sha256", shortHash(metadata.sha256)],
      ["integrity", ui.success("✓ verified")],
    ]),
    "",
    section("Files", metadata.manifest.files.length),
  ];

  for (const file of metadata.manifest.files) {
    const entry = entriesByPath.get(file.path)!;
    const executable = isExecutable(entry.mode);
    const mode = entry.mode.toString(8).padStart(4, "0");
    lines.push(`  ${ui.path(file.path)}`);
    lines.push(
      ...rows(
        [
          [
            "size",
            `${formatBytes(file.size)} ${ui.dim(`(${file.size} bytes)`)}`,
          ],
          ["sha256", shortHash(file.sha256)],
          [
            "mode",
            `${mode}${executable ? ` ${ui.warning("executable")}` : ""}`,
          ],
        ],
        "    ",
      ),
    );
  }

  lines.push("");
  lines.push(section("Executable files", executableFiles.length));
  if (executableFiles.length === 0) {
    lines.push(`  ${ui.dim("None")}`);
  } else {
    lines.push(`  ${warningMessage("Review before installing")}`);
    for (const file of executableFiles) lines.push(`  ${ui.path(file.path)}`);
  }
  if (options.includeInstallCommand !== false) {
    lines.push("");
    lines.push(commandHint(`sk install ${metadata.id}`));
  }
  return lines.join("\n");
};
