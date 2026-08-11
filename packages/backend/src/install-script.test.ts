import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

const script = new URL("../public/install.sh", import.meta.url).pathname
const temporaryDirectories: Array<string> = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const executable = async (directory: string, name: string, body: string) => {
  const path = join(directory, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`)
  await chmod(path, 0o755)
  return path
}

const fixture = async (os = "Darwin") => {
  const directory = await mkdtemp(join(tmpdir(), "skilldrop-installer-"))
  temporaryDirectories.push(directory)
  await executable(directory, "uname", `printf '%s\\n' '${os}'`)
  return directory
}

const runInstaller = async (directory: string, environment: Record<string, string> = {}) => {
  const process = Bun.spawn(["/bin/sh", script], {
    env: {
      PATH: directory,
      NO_COLOR: "1",
      ...environment
    },
    stdout: "pipe",
    stderr: "pipe"
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited
  ])
  return { stdout, stderr, exitCode }
}

describe("install.sh", () => {
  test("installs the CLI package with npm when Node.js is supported", async () => {
    const directory = await fixture()
    const installLog = join(directory, "install.log")
    await executable(directory, "node", `
if [ "\${1:-}" = "-p" ]; then printf '24\\n'; else printf 'v24.0.0\\n'; fi`)
    await executable(directory, "npm", `printf '%s\\n' "$*" > "$INSTALL_LOG"`)
    await executable(directory, "sk", `printf 'sk v1.2.3\\n'`)

    const result = await runInstaller(directory, { INSTALL_LOG: installLog })

    expect(result.exitCode).toBe(0)
    expect(await readFile(installLog, "utf8")).toBe("install --global @skilldrophq/cli\n")
    expect(result.stdout).toContain("installed sk v1.2.3")
  })

  test("falls back to Homebrew when Node.js is too old", async () => {
    const directory = await fixture("Linux")
    const installLog = join(directory, "brew.log")
    await executable(directory, "node", `
if [ "\${1:-}" = "-p" ]; then printf '18\\n'; else printf 'v18.0.0\\n'; fi`)
    await executable(directory, "npm", "exit 99")
    await executable(directory, "brew", `printf '%s\\n' "$*" >> "$INSTALL_LOG"`)
    await executable(directory, "sk", `printf 'sk v1.2.3\\n'`)

    const result = await runInstaller(directory, { INSTALL_LOG: installLog })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("Node.js 20 or newer")
    expect(await readFile(installLog, "utf8")).toBe(
      "tap skilldrophq/tap\ninstall skilldrophq/tap/skilldrop\n"
    )
  })

  test("falls back to Homebrew when npm installation fails", async () => {
    const directory = await fixture()
    const installLog = join(directory, "brew.log")
    await executable(directory, "node", `
if [ "\${1:-}" = "-p" ]; then printf '24\\n'; else printf 'v24.0.0\\n'; fi`)
    await executable(directory, "npm", "exit 1")
    await executable(directory, "brew", `printf '%s\\n' "$*" >> "$INSTALL_LOG"`)
    await executable(directory, "sk", `printf 'sk v1.2.3\\n'`)

    const result = await runInstaller(directory, { INSTALL_LOG: installLog })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain("npm installation failed")
    expect(await readFile(installLog, "utf8")).toContain("install skilldrophq/tap/skilldrop")
  })

  test("fails clearly when no supported installer is available", async () => {
    const directory = await fixture()

    const result = await runInstaller(directory)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("no supported installer is available")
  })

  test("rejects unsupported operating systems", async () => {
    const directory = await fixture("FreeBSD")

    const result = await runInstaller(directory)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("unsupported operating system: FreeBSD")
  })
})
