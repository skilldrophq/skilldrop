import * as Cloudflare from "alchemy/Cloudflare";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Etag from "effect/unstable/http/Etag";
import * as HttpPlatform from "effect/unstable/http/HttpPlatform";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import * as HttpServerRespondable from "effect/unstable/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import { nanoid } from "nanoid";
import { SnapshotApi } from "./api";
import { Bucket } from "./bucket";
import {
  BadRequest,
  CreatedSnapshot,
  InvalidSnapshot,
  PayloadTooLarge,
  SnapshotConflict,
  SnapshotMetadata,
  SnapshotNotFound,
  type SnapshotId,
} from "./models";
import {
  InvalidSnapshotError,
  MAX_COMPRESSED_BUNDLE_BYTES,
  readSnapshot,
} from "./snapshot";

const snapshotKey = (id: SnapshotId) => `snapshots/${id}.tar.gz`;

const HttpPlatformStub = Layer.succeed(HttpPlatform.HttpPlatform, {
  platform: "web",
  compression: {
    algorithms: new Set<HttpPlatform.CompressionAlgorithm>(),
    compressResponse: (response) => Effect.succeed(response),
  },
  fileResponse: () => Effect.die("HttpPlatform.fileResponse not supported"),
  fileWebResponse: () => Effect.die("HttpPlatform.fileWebResponse not supported"),
});

const CacheControl = HttpRouter.middleware(
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest;
      const response = yield* httpEffect;
      if (response.headers["cache-control"] !== undefined) return response;
      const value = request.method === "GET" && response.status === 200
        ? "public, max-age=300"
        : "no-store";
      return HttpServerResponse.setHeader(response, "cache-control", value);
    }),
  { global: true },
);

const recoverRespondableCause = <E>(cause: Cause.Cause<E>) => {
  const failure = Cause.findError(cause);
  if (Result.isSuccess(failure) && HttpServerRespondable.isRespondable(failure.success)) {
    return HttpServerRespondable.toResponse(failure.success).pipe(
      Effect.map(HttpServerResponse.setHeader("cache-control", "no-store")),
    );
  }
  const defect = Cause.findDefect(cause);
  if (Result.isSuccess(defect) && HttpServerRespondable.isRespondable(defect.success)) {
    return HttpServerRespondable.toResponse(defect.success).pipe(
      Effect.map(HttpServerResponse.setHeader("cache-control", "no-store")),
    );
  }
  return Effect.failCause(cause);
};

const validateUpload = Effect.fn("validateUpload")(function*(body: Uint8Array) {
  return yield* Effect.tryPromise({
    try: () => readSnapshot(body),
    catch: (cause) =>
      new InvalidSnapshot({
        message: cause instanceof InvalidSnapshotError
          ? cause.message
          : "Could not validate the bundle",
      }),
  });
});

const readStoredSnapshot = Effect.fn("readStoredSnapshot")(function*(body: Uint8Array) {
  return yield* Effect.tryPromise({
    try: () => readSnapshot(body),
    catch: () => new InvalidSnapshotError("Stored bundle is invalid"),
  }).pipe(Effect.orDie);
});

export default Cloudflare.Worker(
  "SkilldropWorker",
  { main: import.meta.url },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Bucket);
    const workerUrl = yield* Cloudflare.Worker.URL;

    const getObject = Effect.fn("getObject")(function*(id: SnapshotId) {
      const object = yield* bucket.get(snapshotKey(id)).pipe(Effect.orDie);
      if (object === null) {
        return yield* new SnapshotNotFound({ message: "Not found" });
      }
      return object;
    });

    const snapshotsGroup = HttpApiBuilder.group(
      SnapshotApi,
      "snapshots",
      (handlers) =>
        handlers
          .handle(
            "createSnapshot",
            Effect.fn("createSnapshot")(function* () {
              const publicUrl = yield* workerUrl;
              const id = `sk_${nanoid(22)}` as SnapshotId;
              return new CreatedSnapshot({
                id,
                upload_url: new URL(`/v1/snapshots/${id}`, publicUrl).toString(),
              });
            }),
          )
          .handle(
            "uploadSnapshot",
            Effect.fn("uploadSnapshot")(function* ({ params, headers, payload }) {
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
              const stored = yield* bucket.put(snapshotKey(params.id), payload, {
                contentLength,
                onlyIf: { etagDoesNotMatch: "*" },
                sha256: validation.sha256,
                httpMetadata: {
                  contentType: "application/gzip",
                  contentDisposition: 'attachment; filename="bundle.tar.gz"',
                  cacheControl: "public, max-age=31536000, immutable",
                },
              }).pipe(Effect.orDie);
              if (stored === null) {
                return yield* new SnapshotConflict({ message: "Snapshot already exists" });
              }
            }),
          )
          .handle(
            "getSnapshotMetadata",
            Effect.fn("getSnapshotMetadata")(function* ({ params }) {
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
            "downloadSnapshot",
            Effect.fn("downloadSnapshot")(function* ({ params }) {
              const object = yield* getObject(params.id);
              return HttpServerResponse.stream(object.body, {
                contentType: "application/gzip",
                contentLength: object.size,
                headers: {
                  "cache-control": "public, max-age=31536000, immutable",
                  "content-disposition": 'attachment; filename="bundle.tar.gz"',
                  etag: object.httpEtag,
                  "x-content-type-options": "nosniff",
                },
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
      fetch: fetch.pipe(Effect.catchCause(recoverRespondableCause)),
    };
  }).pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketBinding)),
);
