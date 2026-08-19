import { expect, test } from "bun:test";
import { ui } from "../src/ui.ts";

const restore = (name: "FORCE_COLOR" | "NO_COLOR", value?: string) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

test("terminal colors respect FORCE_COLOR and NO_COLOR", () => {
  const forceColor = process.env.FORCE_COLOR;
  const noColor = process.env.NO_COLOR;

  try {
    process.env.FORCE_COLOR = "1";
    delete process.env.NO_COLOR;
    expect(ui.accent("skilldrop")).toBe("\u001b[94mskilldrop\u001b[39m");

    process.env.NO_COLOR = "";
    expect(ui.accent("skilldrop")).toBe("skilldrop");
  } finally {
    restore("FORCE_COLOR", forceColor);
    restore("NO_COLOR", noColor);
  }
});
