import * as Cloudflare from "alchemy/Cloudflare";

export const SNAPSHOT_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

export const Bucket = Cloudflare.R2.Bucket("skilldrop-skills", {
  lifecycleRules: [
    {
      id: "expire-snapshots-after-seven-days",
      prefix: "snapshots/",
      deleteObjectsTransition: {
        condition: { type: "Age", maxAge: SNAPSHOT_LIFETIME_SECONDS },
      },
    },
  ],
});
