/**
 * Platform HTTP client backed by the host fetch implementation.
 */
import { Effect, Layer } from "effect";
import { HttpClient } from "../io/http";

export const FetchHttpClientLive = Layer.succeed(HttpClient)({
  fetch: (url, init) =>
    Effect.tryPromise({
      try: () => globalThis.fetch(url, init),
      catch: (error) => error
    })
});
