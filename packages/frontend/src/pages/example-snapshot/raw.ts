export const prerender = true;

const manifest = `skilldrop-snapshot: 1
id: PL1mY4-
skill: review-pr
created_at: 2026-08-22T14:32:00Z
expires_at: 2026-08-29T14:32:00Z
visibility: unlisted
bundle:
  bytes: 5018
  sha256: 5af18c2b5c1d4d3db9e90e6c8d39d40f…
files:
  - path: SKILL.md
    mode: 0644
    sha256: 9cf2…41b8
  - path: references/checklist.md
    mode: 0644
    sha256: 01aa…7e0f
executables: []
`;

export function GET() {
  return new Response(manifest, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
