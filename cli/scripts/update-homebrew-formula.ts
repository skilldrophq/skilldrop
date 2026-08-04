import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

const packageName = "@skilldrop/cli"

export const tarballUrl = (version: string) =>
  `https://registry.npmjs.org/${packageName}/-/cli-${version}.tgz`

export const updateFormula = (source: string, version: string, sha256: string) =>
  source
    .replace(/^  url ".*"$/m, `  url "${tarballUrl(version)}"`)
    .replace(/^  sha256 ".*"$/m, `  sha256 "${sha256}"`)
    .replace(/assert_match "[^"]+", shell_output/, `assert_match "${version}", shell_output`)

const downloadTarball = async (version: string) => {
  const url = tarballUrl(version)
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(url, { cache: "no-store" })
    if (response.ok) return new Uint8Array(await response.arrayBuffer())
    if (attempt === 12) throw new Error(`npm tarball returned ${response.status}: ${url}`)
    await Bun.sleep(5_000)
  }
  throw new Error(`npm tarball did not become available: ${url}`)
}

const main = async () => {
  const version = Bun.argv[2]
  const destinationArgument = Bun.argv[3]
  if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Usage: update-homebrew-formula.ts <version> [destination]")
  }

  const repositoryRoot = resolve(import.meta.dir, "../..")
  const templatePath = resolve(repositoryRoot, "Formula/skilldrop.rb")
  const destination = destinationArgument === undefined
    ? templatePath
    : resolve(repositoryRoot, destinationArgument)
  const template = await readFile(templatePath, "utf8")
  const tarball = await downloadTarball(version)
  const sha256 = createHash("sha256").update(tarball).digest("hex")
  const formula = updateFormula(template, version, sha256)

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, formula)
  console.log(`Updated ${destination} to ${version} (${sha256})`)
}

if (import.meta.main) await main()
