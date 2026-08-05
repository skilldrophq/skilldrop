import { Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { SkillManifest } from "./archive.ts"
import { CliError, messageFromCause } from "./errors.ts"

const SnapshotId = Schema.String.check(Schema.isPattern(/^(?:sk_[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{7,22})$/))

class CreatedSnapshot extends Schema.Class<CreatedSnapshot>("CreatedSnapshot")({
  id: SnapshotId,
  upload_url: Schema.String
}) {}

export class SnapshotMetadata extends Schema.Class<SnapshotMetadata>("SnapshotMetadata")({
  id: SnapshotId,
  size: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  manifest: SkillManifest,
  uploaded_at: Schema.String
}) {}

const responseError = Effect.fn("responseError")(function*(response: HttpClientResponse.HttpClientResponse) {
  const message = yield* response.text.pipe(Effect.orElseSucceed(() => "Request failed"))
  return new CliError({ message: `Skilldrop returned ${response.status}: ${message.trim() || "Request failed"}` })
})

const expectStatus = Effect.fn("expectStatus")(function*(response: HttpClientResponse.HttpClientResponse, status: number) {
  if (response.status !== status) return yield* responseError(response)
  return response
})

export class SkilldropApi extends Context.Service<SkilldropApi, {
  create(apiUrl: string): Effect.Effect<CreatedSnapshot, CliError>
  upload(uploadUrl: string, bytes: Uint8Array): Effect.Effect<void, CliError>
  metadata(apiUrl: string, id: string): Effect.Effect<SnapshotMetadata, CliError>
  download(apiUrl: string, id: string): Effect.Effect<Uint8Array, CliError>
}>()("@skilldrophq/cli/SkilldropApi") {
  static readonly layer = Layer.effect(
    SkilldropApi,
    Effect.gen(function*() {
      const client = yield* HttpClient.HttpClient
      const execute = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
        Effect.mapError((cause) => new CliError({ message: `Could not reach Skilldrop: ${messageFromCause(cause)}` }))
      )
      const endpoint = (apiUrl: string, pathname: string) => {
        try {
          return new URL(pathname, apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`).toString()
        } catch {
          throw new CliError({ message: `Invalid Skilldrop API URL: ${apiUrl}` })
        }
      }
      const create = Effect.fn("SkilldropApi.create")(function*(apiUrl: string) {
        const response = yield* execute(client.post(endpoint(apiUrl, "/v1/snapshots")))
        yield* expectStatus(response, 201)
        return yield* HttpClientResponse.schemaBodyJson(CreatedSnapshot)(response).pipe(
          Effect.mapError(() => new CliError({ message: "Skilldrop returned an invalid create response" }))
        )
      })
      const upload = Effect.fn("SkilldropApi.upload")(function*(uploadUrl: string, bytes: Uint8Array) {
        const response = yield* HttpClientRequest.put(uploadUrl).pipe(
          HttpClientRequest.bodyUint8Array(bytes, "application/gzip"),
          client.execute,
          execute
        )
        yield* expectStatus(response, 201)
      })
      const metadata = Effect.fn("SkilldropApi.metadata")(function*(apiUrl: string, id: string) {
        const response = yield* execute(client.get(endpoint(apiUrl, `/v1/snapshots/${id}`)))
        yield* expectStatus(response, 200)
        return yield* HttpClientResponse.schemaBodyJson(SnapshotMetadata)(response).pipe(
          Effect.mapError(() => new CliError({ message: "Skilldrop returned invalid snapshot metadata" }))
        )
      })
      const download = Effect.fn("SkilldropApi.download")(function*(apiUrl: string, id: string) {
        const response = yield* execute(client.get(endpoint(apiUrl, `/s/${id}/bundle`)))
        yield* expectStatus(response, 200)
        const buffer = yield* response.arrayBuffer.pipe(
          Effect.mapError((cause) => new CliError({ message: `Could not read bundle: ${messageFromCause(cause)}` }))
        )
        return new Uint8Array(buffer)
      })
      return SkilldropApi.of({ create, upload, metadata, download })
    })
  ).pipe(Layer.provide(FetchHttpClient.layer))
}

export const parseSnapshotId = (input: string): Effect.Effect<string, CliError> => {
  const candidate = input.match(/(?:^|\/)(sk_[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{7,22})(?:\/)?$/)?.[1] ?? input
  return Schema.decodeUnknownEffect(SnapshotId)(candidate).pipe(
    Effect.mapError(() => new CliError({ message: `Invalid Skilldrop snapshot: ${input}` }))
  )
}
