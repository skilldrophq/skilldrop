import { describe, expect, test } from "bun:test";
import { renderDoctorReport } from "../src/doctor.ts";

describe("doctor report", () => {
  test("renders checks, fixes, and summary counts", () => {
    const output = renderDoctorReport([
      { label: "Node.js", status: "pass", detail: "v24.0.0" },
      {
        label: "Agents",
        status: "warn",
        detail: "No agents detected",
        fix: "Install an agent or use Universal",
      },
      {
        label: "Global skills",
        status: "fail",
        detail: "/skills is not writable",
        fix: "Grant write access",
      },
    ]);

    expect(output).toContain("✓ Node.js        v24.0.0");
    expect(output).toContain("! Agents         No agents detected");
    expect(output).toContain("✗ Global skills  /skills is not writable");
    expect(output).toContain("↳ Grant write access");
    expect(output).toContain("1 passed  ·  1 warnings  ·  1 failed");
  });
});
