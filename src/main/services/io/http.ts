import { Context, Effect, Layer } from "effect";

export type HttpClientService = {
  readonly fetch: (url: string, init?: RequestInit) => Effect.Effect<Response, unknown>;
};

export const HttpClient = Context.Service<HttpClientService>("relay/HttpClient");

export const HttpClientLive = Layer.succeed(HttpClient)({
  fetch: (url, init) =>
    Effect.tryPromise({
      try: () => globalThis.fetch(url, init),
      catch: (error) => error
    })
});

export const fetchUrlEffect = (
  url: string,
  init?: RequestInit
): Effect.Effect<Response, unknown, Context.Service.Identifier<typeof HttpClient>> =>
  HttpClient.use((client) => client.fetch(url, init));
