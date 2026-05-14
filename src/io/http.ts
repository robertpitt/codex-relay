import { Context, Effect } from "effect";

export type HttpClientService = {
  readonly fetch: (url: string, init?: RequestInit) => Effect.Effect<Response, unknown>;
};

export const HttpClient = Context.Service<HttpClientService>("relay/HttpClient");

export const fetchUrlEffect = (
  url: string,
  init?: RequestInit
): Effect.Effect<Response, unknown, Context.Service.Identifier<typeof HttpClient>> =>
  HttpClient.use((client) => client.fetch(url, init));
