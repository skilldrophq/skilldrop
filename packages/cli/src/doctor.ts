import { Effect, FileSystem, Path } from "effect"
import { detectInstalledAgents, loadAgentTopology } from "./agents.ts"

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
  if (!writable) {
    return {
      label,
      status: "fail" as const,
      detail: `${target} is not writable`,
      fix: `Grant write access to ${probe} or choose another installation scope`
    }
  }
  return {
    label,
    status: "pass" as const,
    detail: targetExists ? `${target} is writable` : `${target} can be created`
  }
})

export const runDoctor = Effect.fn("runDoctor")(function*() {
  const topology = yield* loadAgentTopology()
  const detected = yield* detectInstalledAgents(topology)
  const nodeVersion = process.versions.node
  const nodeMajor = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10)
  const nodeCheck: DoctorCheck = nodeMajor >= 20
    ? { label: "Node.js", status: "pass", detail: `v${nodeVersion}` }
    : {
        label: "Node.js",
        status: "fail",
        detail: `v${nodeVersion} is unsupported`,
        fix: "Install Node.js 20 or newer"
      }
  const agentCheck: DoctorCheck = detected.length > 0
    ? {
        label: "Agents",
        status: "pass",
        detail: detected.map((agent) => agent.displayName).join(", ")
      }
    : {
        label: "Agents",
        status: "warn",
        detail: "No agent config directories detected; Universal remains available",
        fix: "Install an agent or use --agent universal explicitly"
      }
  const checks: Array<DoctorCheck> = [nodeCheck, agentCheck]

  checks.push(yield* writableTargetCheck("Project skills", topology.canonicalRoots.project))
  checks.push(yield* writableTargetCheck("Global skills", topology.canonicalRoots.global))
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
