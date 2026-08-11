import * as Cloudflare from "alchemy/Cloudflare";

export const Events = Cloudflare.AnalyticsEngine.Dataset("Events", {
  dataset: "worker_events",
});
