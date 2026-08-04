import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

export const SnapshotId = Schema.String.check(
  Schema.isPattern(/^sk_[A-Za-z0-9_-]{22}$/),
);
export type SnapshotId = typeof SnapshotId.Type;

export const Manifest = Schema.Record(Schema.String, Schema.Json);
export type Manifest = typeof Manifest.Type;

export class CreatedSnapshot extends Schema.Class<CreatedSnapshot>("CreatedSnapshot")({
  id: SnapshotId,
  upload_url: Schema.String,
}) {}

export const CreatedSnapshotResponse = CreatedSnapshot.pipe(
  HttpApiSchema.status("Created"),
);

export class SnapshotMetadata extends Schema.Class<SnapshotMetadata>("SnapshotMetadata")({
  id: SnapshotId,
  size: Schema.Finite,
  sha256: Schema.String,
  manifest: Manifest,
  uploaded_at: Schema.String,
}) {}

export class BadRequest extends Schema.TaggedErrorClass<BadRequest>()("BadRequest", {
  message: Schema.String,
}) {}

export class SnapshotNotFound extends Schema.TaggedErrorClass<SnapshotNotFound>()("SnapshotNotFound", {
  message: Schema.String,
}) {}

export class SnapshotConflict extends Schema.TaggedErrorClass<SnapshotConflict>()("SnapshotConflict", {
  message: Schema.String,
}) {}

export class PayloadTooLarge extends Schema.TaggedErrorClass<PayloadTooLarge>()("PayloadTooLarge", {
  message: Schema.String,
}) {}

export class InvalidSnapshot extends Schema.TaggedErrorClass<InvalidSnapshot>()("InvalidSnapshot", {
  message: Schema.String,
}) {}

export const BadRequestResponse = Schema.String.pipe(
  Schema.decodeTo(
    BadRequest,
    SchemaTransformation.transform({
      decode: (message) => ({ _tag: "BadRequest" as const, message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("BadRequest"),
);

export const SnapshotNotFoundResponse = Schema.String.pipe(
  Schema.decodeTo(
    SnapshotNotFound,
    SchemaTransformation.transform({
      decode: (message) => ({ _tag: "SnapshotNotFound" as const, message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("NotFound"),
);

export const SnapshotConflictResponse = Schema.String.pipe(
  Schema.decodeTo(
    SnapshotConflict,
    SchemaTransformation.transform({
      decode: (message) => ({ _tag: "SnapshotConflict" as const, message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("Conflict"),
);

export const PayloadTooLargeResponse = Schema.String.pipe(
  Schema.decodeTo(
    PayloadTooLarge,
    SchemaTransformation.transform({
      decode: (message) => ({ _tag: "PayloadTooLarge" as const, message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("PayloadTooLarge"),
);

export const InvalidSnapshotResponse = Schema.String.pipe(
  Schema.decodeTo(
    InvalidSnapshot,
    SchemaTransformation.transform({
      decode: (message) => ({ _tag: "InvalidSnapshot" as const, message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("UnprocessableEntity"),
);
