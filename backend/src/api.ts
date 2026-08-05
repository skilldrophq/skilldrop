import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";
import {
  BadRequestResponse,
  CreatedSnapshotResponse,
  InvalidSnapshotResponse,
  PayloadTooLargeResponse,
  SnapshotConflictResponse,
  CanonicalSnapshotId,
  SnapshotId,
  SnapshotMetadata,
  SnapshotNotFoundResponse,
} from "./models";

const SnapshotParams = Schema.Struct({ id: SnapshotId });
const CanonicalSnapshotParams = Schema.Struct({ id: CanonicalSnapshotId });

const createSnapshot = HttpApiEndpoint.post("createSnapshot", "/v1/snapshots", {
  success: CreatedSnapshotResponse,
});

const uploadSnapshot = HttpApiEndpoint.put("uploadSnapshot", "/v1/snapshots/:id", {
  params: CanonicalSnapshotParams,
  headers: Schema.Struct({
    "content-length": Schema.optional(Schema.String),
  }),
  payload: Schema.Uint8Array.pipe(
    HttpApiSchema.asUint8Array({ contentType: "application/gzip" }),
  ),
  success: HttpApiSchema.Created,
  error: [
    BadRequestResponse,
    SnapshotConflictResponse,
    PayloadTooLargeResponse,
    InvalidSnapshotResponse,
  ],
});

const getSnapshotMetadata = HttpApiEndpoint.get(
  "getSnapshotMetadata",
  "/v1/snapshots/:id",
  {
    params: SnapshotParams,
    success: SnapshotMetadata,
    error: SnapshotNotFoundResponse,
  },
);

const getSnapshot = HttpApiEndpoint.get("getSnapshot", "/s/:id", {
  params: SnapshotParams,
  success: Schema.String.pipe(
    HttpApiSchema.asText({ contentType: "text/markdown; charset=utf-8" }),
  ),
  error: SnapshotNotFoundResponse,
});

const downloadSnapshot = HttpApiEndpoint.get("downloadSnapshot", "/s/:id/bundle", {
  params: SnapshotParams,
  success: HttpApiSchema.StreamUint8Array({ contentType: "application/gzip" }),
  error: SnapshotNotFoundResponse,
});

export class SnapshotsGroup extends HttpApiGroup.make("snapshots")
  .add(createSnapshot)
  .add(uploadSnapshot)
  .add(getSnapshotMetadata)
  .add(getSnapshot)
  .add(downloadSnapshot) {}

export class SnapshotApi extends HttpApi.make("SnapshotApi").add(SnapshotsGroup) {}
