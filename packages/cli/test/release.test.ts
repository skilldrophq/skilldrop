import { expect, test } from "bun:test";
import {
  tarballUrl,
  updateFormula,
} from "../scripts/update-homebrew-formula.ts";

test("renders a Homebrew formula for an npm release", () => {
  const current = `class Skilldrop < Formula
  url "https://registry.npmjs.org/@skilldrophq/cli/-/cli-0.0.2.tgz"
  sha256 "old"
  test do
    assert_match "0.0.2", shell_output("#{bin}/sk --version")
  end
end
`;
  const rendered = updateFormula(current, "1.2.3", "abc123");

  expect(tarballUrl("1.2.3")).toBe(
    "https://registry.npmjs.org/@skilldrophq/cli/-/cli-1.2.3.tgz",
  );
  expect(rendered).toContain(
    'url "https://registry.npmjs.org/@skilldrophq/cli/-/cli-1.2.3.tgz"',
  );
  expect(rendered).toContain('sha256 "abc123"');
  expect(rendered).toContain('assert_match "1.2.3"');
});
