import * as Cloudflare from "alchemy/Cloudflare";
import type * as AlchemyOutput from "alchemy/Output";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import {
  HttpServerRequest,
  MaxBodySize,
} from "effect/unstable/http/HttpServerRequest";
import * as HttpServerRespondable from "effect/unstable/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { nanoid } from "nanoid";
import installScript from "../public/install.sh?raw";
import { SnapshotApi } from "./api";
import { Bucket, SNAPSHOT_LIFETIME_SECONDS } from "./bucket";
import { Events } from "./dataset";
import {
  BadRequest,
  type CanonicalSnapshotId,
  CreatedSnapshot,
  InvalidSnapshot,
  NotFound,
  PayloadTooLarge,
  SnapshotConflict,
  type SnapshotId,
  SnapshotMetadata,
  SnapshotNotFound,
} from "./models";
import {
  InvalidSnapshotError,
  MAX_COMPRESSED_BUNDLE_BYTES,
  readSnapshot,
} from "./snapshot";

export interface WebsiteAssets {
  readonly directory: string | AlchemyOutput.Output<string>;
  readonly hash: string | AlchemyOutput.Output<string>;
  readonly domain?: string | Cloudflare.WorkerDomainConfig;
}

const MIN_PUBLIC_ID_LENGTH = 7;
const NO_INDEX_HEADER = "noindex, nofollow, noarchive";
const SKILLDROP_CLI_USER_AGENT_PREFIX = "skilldrop-cli/";

const snapshotKey = (id: string) => `snapshots/${id}.tar.gz`;
const snapshotAliasKey = (id: SnapshotId) => `aliases/${id}`;

export const isContentAddressedId = (id: CanonicalSnapshotId) =>
  /^[a-f0-9]{64}$/.test(id);

export const snapshotContentMatchesId = (
  id: CanonicalSnapshotId,
  contentSha256: string,
) => !isContentAddressedId(id) || id === contentSha256;

export const snapshotAliasCandidates = (
  id: CanonicalSnapshotId,
): ReadonlyArray<SnapshotId> =>
  Array.from(
    { length: id.length - MIN_PUBLIC_ID_LENGTH + 1 },
    (_, index) => id.slice(0, MIN_PUBLIC_ID_LENGTH + index) as SnapshotId,
  );

export const isSkilldropCliUserAgent = (userAgent: string) =>
  userAgent.startsWith(SKILLDROP_CLI_USER_AGENT_PREFIX);

export const shouldShowSnapshotWebsite = (userAgent: string, accept: string) =>
  /Mozilla\/\d/i.test(userAgent) && /(?:^|,)\s*text\/html\b/i.test(accept);

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () =>
    Effect.die("HttpPlatform.fileWebResponse not supported"),
});

const CacheControl = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest;
      const response = yield* httpEffect;
      if (response.headers["cache-control"] !== undefined) return response;
      const value =
        request.method === "GET" && response.status === 200
          ? "public, max-age=300"
          : "no-store";
      return HttpServerResponse.setHeader(response, "cache-control", value);
    }),
  { global: true },
);

const recoverRespondableCause = <E>(cause: Cause.Cause<E>) => {
  const failure = Cause.findError(cause);
  if (
    Result.isSuccess(failure) &&
    HttpServerRespondable.isRespondable(failure.success)
  ) {
    return HttpServerRespondable.toResponse(failure.success).pipe(
      Effect.map(HttpServerResponse.setHeader("cache-control", "no-store")),
    );
  }
  const defect = Cause.findDefect(cause);
  if (
    Result.isSuccess(defect) &&
    HttpServerRespondable.isRespondable(defect.success)
  ) {
    return HttpServerRespondable.toResponse(defect.success).pipe(
      Effect.map(HttpServerResponse.setHeader("cache-control", "no-store")),
    );
  }
  return Effect.failCause(cause);
};

const validateUpload = Effect.fn("validateUpload")(function* (
  body: Uint8Array,
) {
  return yield* Effect.tryPromise({
    try: () => readSnapshot(body),
    catch: (cause) =>
      new InvalidSnapshot({
        message:
          cause instanceof InvalidSnapshotError
            ? cause.message
            : "Could not validate the bundle",
      }),
  });
});

const readStoredSnapshot = Effect.fn("readStoredSnapshot")(function* (
  body: Uint8Array,
) {
  return yield* Effect.tryPromise({
    try: () => readSnapshot(body),
    catch: () => new InvalidSnapshotError("Stored bundle is invalid"),
  }).pipe(Effect.orDie);
});

const WorkerImplementation = Effect.gen(function* () {
  const bucket = yield* Cloudflare.R2.ReadWriteBucket(Bucket);
  const analytics = yield* Cloudflare.AnalyticsEngine.WriteDataset(Events);

  const recordEndpoint = Effect.fn("recordEndpoint")(function* (
    endpoint: string,
  ) {
    const request = yield* HttpServerRequest;
    const userAgent = request.headers["user-agent"] ?? "unknown";
    const client = isSkilldropCliUserAgent(userAgent) ? "cli" : "other";

    yield* Effect.log("endpoint").pipe(
      Effect.annotateLogs({
        endpoint,
        "user-agent": userAgent,
        client,
      }),
    );

    yield* analytics
      .writeDataPoint({
        indexes: ["endpoints"],
        blobs: [endpoint, userAgent, client],
        doubles: [1],
      })
      .pipe(
        Effect.catchTag("DatasetError", (cause) =>
          Effect.logError("Failed to record endpoint analytics", cause).pipe(
            Effect.annotateLogs({ endpoint }),
          ),
        ),
      );
  });

  const getObject = Effect.fn("getObject")(function* (id: SnapshotId) {
    const direct = yield* bucket.get(snapshotKey(id)).pipe(Effect.orDie);
    if (direct !== null) return direct;

    const alias = yield* bucket.get(snapshotAliasKey(id)).pipe(Effect.orDie);
    if (alias === null) {
      return yield* new SnapshotNotFound({ message: "Not found" });
    }
    const canonicalId = yield* alias.text().pipe(Effect.orDie);
    const object = yield* bucket
      .get(snapshotKey(canonicalId))
      .pipe(Effect.orDie);
    if (object === null) {
      return yield* new SnapshotNotFound({ message: "Not found" });
    }
    return object;
  });

  const reserveSnapshotAlias = Effect.fn("reserveSnapshotAlias")(function* (
    id: CanonicalSnapshotId,
  ) {
    for (const candidate of snapshotAliasCandidates(id)) {
      const direct = yield* bucket
        .get(snapshotKey(candidate))
        .pipe(Effect.orDie);
      if (direct !== null) {
        if (candidate === id) return candidate;
        continue;
      }
      const existing = yield* bucket
        .get(snapshotAliasKey(candidate))
        .pipe(Effect.orDie);
      if (existing !== null) {
        if ((yield* existing.text().pipe(Effect.orDie)) === id)
          return candidate;
        continue;
      }
      const stored = yield* bucket
        .put(snapshotAliasKey(candidate), id, {
          onlyIf: { etagDoesNotMatch: "*" },
        })
        .pipe(Effect.orDie);
      if (stored !== null) return candidate;
      const raced = yield* bucket
        .get(snapshotAliasKey(candidate))
        .pipe(Effect.orDie);
      if (raced !== null && (yield* raced.text().pipe(Effect.orDie)) === id) {
        return candidate;
      }
    }
    return undefined;
  });

  const snapshotsGroup = HttpApiBuilder.group(
    SnapshotApi,
    "snapshots",
    (handlers) =>
      handlers
        .handle(
          "createSnapshot",
          Effect.fn("createSnapshot")(function* ({ headers }) {
            yield* recordEndpoint("createSnapshot");
            const request = yield* HttpServerRequest;
            let canonicalId: CanonicalSnapshotId;
            let id: SnapshotId | undefined;
            do {
              canonicalId =
                headers["x-skilldrop-snapshot-id"] ??
                (nanoid(22) as CanonicalSnapshotId);
              id = yield* reserveSnapshotAlias(canonicalId);
            } while (id === undefined);
            const protocol = request.headers["x-forwarded-proto"] ?? "http";
            const host =
              request.headers["x-forwarded-host"] ??
              request.headers.host ??
              "localhost";
            const requestUrl = URL.canParse(request.url)
              ? request.url
              : `${protocol}://${host}${request.url}`;
            return new CreatedSnapshot({
              id,
              upload_url: new URL(
                `/v1/snapshots/${canonicalId}`,
                requestUrl,
              ).toString(),
            });
          }),
        )
        .handle(
          "uploadSnapshot",
          Effect.fn("uploadSnapshot")(function* ({ params, headers, payload }) {
            yield* recordEndpoint("uploadSnapshot");
            const contentLength = Number(headers["content-length"] ?? "");
            if (
              !Number.isSafeInteger(contentLength) ||
              contentLength < 1 ||
              contentLength > MAX_COMPRESSED_BUNDLE_BYTES
            ) {
              return yield* new PayloadTooLarge({
                message: "Invalid or oversized Content-Length",
              });
            }
            if (payload.byteLength !== contentLength) {
              return yield* new BadRequest({
                message: "Content-Length does not match request body",
              });
            }

            const validation = yield* validateUpload(payload);
            if (
              !snapshotContentMatchesId(params.id, validation.contentSha256)
            ) {
              return yield* new InvalidSnapshot({
                message: "Snapshot content does not match its ID",
              });
            }
            const stored = yield* bucket
              .put(snapshotKey(params.id), payload, {
                contentLength,
                onlyIf: { etagDoesNotMatch: "*" },
                sha256: validation.sha256,
                httpMetadata: {
                  contentType: "application/gzip",
                  contentDisposition: 'attachment; filename="bundle.tar.gz"',
                  cacheControl: `public, max-age=${SNAPSHOT_LIFETIME_SECONDS}, immutable`,
                },
              })
              .pipe(Effect.orDie);
            if (stored === null) {
              if (isContentAddressedId(params.id)) return;
              return yield* new SnapshotConflict({
                message: "Snapshot already exists",
              });
            }
          }),
        )
        .handle(
          "getSnapshotMetadata",
          Effect.fn("getSnapshotMetadata")(function* ({ params }) {
            yield* recordEndpoint("getSnapshotMetadata");
            const object = yield* getObject(params.id);
            const bytes = yield* object.bytes().pipe(Effect.orDie);
            const snapshot = yield* readStoredSnapshot(bytes);
            return new SnapshotMetadata({
              id: params.id,
              size: object.size,
              sha256: snapshot.sha256,
              manifest: snapshot.manifest,
              uploaded_at: object.uploaded.toISOString(),
            });
          }),
        )
        .handle(
          "getSnapshot",
          Effect.fn("getSnapshot")(function* ({ params }) {
            yield* recordEndpoint("getSnapshot");
            const request = yield* HttpServerRequest;
            if (
              shouldShowSnapshotWebsite(
                request.headers["user-agent"] ?? "",
                request.headers.accept ?? "",
              )
            ) {
              return HttpServerResponse.redirect(
                `/snapshot/?id=${encodeURIComponent(params.id)}`,
                { status: 302 },
              );
            }
            const object = yield* getObject(params.id);
            const bytes = yield* object.bytes().pipe(Effect.orDie);
            const snapshot = yield* readStoredSnapshot(bytes);
            return HttpServerResponse.text(snapshot.skillMarkdown, {
              contentType: "text/markdown; charset=utf-8",
              headers: {
                "cache-control": "public, max-age=300",
                etag: object.httpEtag,
                "x-content-type-options": "nosniff",
              },
            });
          }),
        )
        .handle(
          "getSnapshotFile",
          Effect.fn("getSnapshotFile")(function* ({ params, query }) {
            yield* recordEndpoint("getSnapshotFile");
            const object = yield* getObject(params.id);
            const bytes = yield* object.bytes().pipe(Effect.orDie);
            const snapshot = yield* readStoredSnapshot(bytes);
            const content = snapshot.files.get(query.path);
            if (content === undefined) {
              return yield* new SnapshotNotFound({ message: "File not found" });
            }
            return content;
          }),
        )
        .handle(
          "downloadSnapshot",
          Effect.fn("downloadSnapshot")(function* ({ params }) {
            yield* recordEndpoint("downloadSnapshot");
            const object = yield* getObject(params.id);
            return HttpServerResponse.stream(object.body, {
              contentType: "application/gzip",
              contentLength: object.size,
              headers: {
                "cache-control": `public, max-age=${SNAPSHOT_LIFETIME_SECONDS}, immutable`,
                "content-disposition": 'attachment; filename="bundle.tar.gz"',
                etag: object.httpEtag,
                "x-content-type-options": "nosniff",
              },
            });
          }),
        )
        .handle(
          "install",
          Effect.fn("install")(function* ({ request }) {
            yield* recordEndpoint("install");
            const hostname = /^https?:\/\/([^/?#:]+)(?::\d+)?(?:[/?#]|$)/i.exec(
              request.originalUrl,
            )?.[1];
            yield* Effect.succeed(hostname).pipe(
              Effect.filterOrElse(
                (value): value is string =>
                  value !== undefined && /(?:^|\.)getsk\.dev$/.test(value),
                () => Effect.fail(new NotFound()),
              ),
              Effect.tapError(() =>
                Effect.logError("tried to install on wrong domain").pipe(
                  Effect.annotateLogs({ url: request.url }),
                ),
              ),
            );
            return HttpServerResponse.text(installScript, {
              contentType: "text/x-shellscript",
            });
          }),
        ),
  );

  const fetch = yield* HttpRouter.toHttpEffect(
    HttpApiBuilder.layer(SnapshotApi).pipe(
      Layer.provide(snapshotsGroup),
      Layer.provide([Etag.layer, HttpPlatformStub, Path.layer]),
      Layer.provide(CacheControl),
    ),
  );

  return {
    fetch: fetch.pipe(
      Effect.provideService(
        MaxBodySize,
        FileSystem.Size(MAX_COMPRESSED_BUNDLE_BYTES),
      ),
      Effect.catchCause(recoverRespondableCause),
      Effect.map(HttpServerResponse.setHeader("x-robots-tag", NO_INDEX_HEADER)),
    ),
  };
}).pipe(
  Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
  Effect.provide(Cloudflare.AnalyticsEngine.WriteDatasetBinding),
);

export class SkilldropWorker extends Cloudflare.Worker<
  SkilldropWorker,
  Cloudflare.WorkerShape
>()("SkilldropWorker") {}

const workerLayer = (props: Parameters<typeof SkilldropWorker.make>[0]) =>
  SkilldropWorker.make(props, WorkerImplementation);

export default workerLayer({ main: import.meta.url });

export const makeWorker = ({ directory, domain, hash }: WebsiteAssets) =>
  SkilldropWorker.pipe(
    Effect.provide(
      workerLayer({
        main: import.meta.url,
        domain,
        assets: {
          directory,
          hash,
          runWorkerFirst: ["/s/*", "/v1/*", "/install.sh"],
        },
      }),
    ),
  );
