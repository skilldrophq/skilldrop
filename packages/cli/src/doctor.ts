import { Effect, FileSystem, Path } from "effect"
import { detectInstalledAgents, loadAgents } from "./agents.ts"

export type DoctorStatus = "pass" | "warn" | "fail"

export interface DoctorCheck {
  readonly label: string
  readonly status: DoctorStatus
  readonly detail: string
  readonly fix?: string
}

const writableTargetCheck = Effect.fn("writableTargetCheck")(function*(label: string, target: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const targetExists = yield* fs.exists(target).pipe(Effect.orElseSucceed(() => false))
  let probe = target
  while (!(yield* fs.exists(probe).pipe(Effect.orElseSucceed(() => false)))) {
    const parent = path.dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  const writable = yield* fs.access(probe, { writable: true }).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  )
  return writable
    ? {
        label,
        status: "pass" as const,
        detail: targetExists ? `${target} is writable` : `${target} can be created`
      }
    : {
        label,
        status: "fail" as const,
        detail: `${target} is not writable`,
        fix: `Grant write access to ${probe} or choose another installation scope`
      }
})

export const runDoctor = Effect.fn("runDoctor")(function*() {
  const path = yield* Path.Path
  const { definitions, home } = yield* loadAgents()
  const detected = yield* detectInstalledAgents(definitions)
  const nodeVersion = process.versions.node
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10)
  const checks: Array<DoctorCheck> = [{
    label: "Node.js",
    status: nodeMajor >= 20 ? "pass" : "fail",
    detail: `v${nodeVersion}${nodeMajor >= 20 ? "" : " is unsupported"}`,
    ...(nodeMajor >= 20 ? {} : { fix: "Install Node.js 20 or newer" })
  }, {
    label: "Agents",
    status: detected.length > 0 ? "pass" : "warn",
    detail: detected.length > 0
      ? detected.map((agent) => agent.displayName).join(", ")
      : "No agent config directories detected; Universal remains available",
    ...(detected.length > 0 ? {} : { fix: "Install an agent or use --agent universal explicitly" })
  }]

  checks.push(yield* writableTargetCheck("Project skills", path.resolve(".agents", "skills")))
  checks.push(yield* writableTargetCheck("Global skills", path.join(home, ".agents", "skills")))
  return checks
})

export const renderDoctorReport = (checks: ReadonlyArray<DoctorCheck>) => {
  const symbol: Record<DoctorStatus, string> = { pass: "✓", warn: "!", fail: "✗" }
  const lines = ["Skilldrop doctor"]
  for (const check of checks) {
    lines.push(`  ${symbol[check.status]} ${check.label}: ${check.detail}`)
    if (check.fix !== undefined) lines.push(`    fix: ${check.fix}`)
  }
  const passed = checks.filter((check) => check.status === "pass").length
  const warnings = checks.filter((check) => check.status === "warn").length
  const failures = checks.filter((check) => check.status === "fail").length
  lines.push("")
  lines.push(`${passed} passed · ${warnings} warnings · ${failures} failed`)
  return lines.join("\n")
}
