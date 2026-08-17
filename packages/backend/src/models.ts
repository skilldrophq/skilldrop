import { Schema } from "effect";
import * as SchemaTransformation from "effect/SchemaTransformation";
import * as HttpApiSchema from "effect/unstable/httpapi/HttpApiSchema";

export const SnapshotId = Schema.String.check(
  Schema.isPattern(
    /^(?:sk_[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{7,22}|[a-f0-9]{23,64})$/,
  ),
);
export type SnapshotId = typeof SnapshotId.Type;

export const CanonicalSnapshotId = Schema.String.check(
  Schema.isPattern(/^(?:[A-Za-z0-9_-]{22}|[a-f0-9]{64})$/),
);
export type CanonicalSnapshotId = typeof CanonicalSnapshotId.Type;

export class ManifestFile extends Schema.Class<ManifestFile>("ManifestFile")({
  path: Schema.String,
  size: Schema.Natural,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
}) {}

export class Manifest extends Schema.Class<Manifest>("Manifest")({
  protocol_version: Schema.Literal(1),
  name: Schema.String.check(
    Schema.isPattern(/^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  ),
  files: Schema.Array(ManifestFile),
}) {}

export class CreatedSnapshot extends Schema.Class<CreatedSnapshot>(
  "CreatedSnapshot",
)({
  id: SnapshotId,
  upload_url: Schema.String,
}) {}

export const CreatedSnapshotResponse = CreatedSnapshot.pipe(
  HttpApiSchema.status("Created"),
);

export class SnapshotMetadata extends Schema.Class<SnapshotMetadata>(
  "SnapshotMetadata",
)({
  id: SnapshotId,
  size: Schema.Finite,
  sha256: Schema.String,
  manifest: Manifest,
  uploaded_at: Schema.String,
}) {}

export class BadRequest extends Schema.Error<BadRequest>("BadRequest")({
  message: Schema.String,
}) {}

export class SnapshotNotFound extends Schema.Error<SnapshotNotFound>(
  "SnapshotNotFound",
)({
  message: Schema.String,
}) {}

export class SnapshotConflict extends Schema.Error<SnapshotConflict>(
  "SnapshotConflict",
)({
  message: Schema.String,
}) {}

export class PayloadTooLarge extends Schema.Error<PayloadTooLarge>(
  "PayloadTooLarge",
)({
  message: Schema.String,
}) {}

export class InvalidSnapshot extends Schema.Error<InvalidSnapshot>(
  "InvalidSnapshot",
)({
  message: Schema.String,
}) {}

export class NotFound extends Schema.Error<NotFound>("NotFound")({}) {}

export const BadRequestResponse = Schema.String.pipe(
  Schema.decodeTo(
    BadRequest,
    SchemaTransformation.transform({
      decode: (message) => ({ message }),
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
      decode: (message) => ({ message }),
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
      decode: (message) => ({ message }),
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
      decode: (message) => ({ message }),
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
      decode: (message) => ({ message }),
      encode: (error) => error.message,
    }),
  ),
  HttpApiSchema.asText({ contentType: "text/plain; charset=utf-8" }),
  HttpApiSchema.status("UnprocessableEntity"),
);
