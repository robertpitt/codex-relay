import { Effect } from "effect";
import type { IncomingMessage } from "node:http";

export type HttpRequestContext = {
  readonly request: IncomingMessage;
  readonly url: URL;
  readonly expectedToken: string;
  readonly corsHeaders: Readonly<Record<string, string>>;
};

export type HttpResponseDraft = {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
};

export type HttpRequestMiddlewareResult =
  | { readonly _tag: "continue"; readonly context: HttpRequestContext }
  | { readonly _tag: "respond"; readonly context?: HttpRequestContext; readonly response: HttpResponseDraft };

export type HttpMiddleware = {
  readonly name: string;
  readonly onRequest?: (context: HttpRequestContext) => Effect.Effect<HttpRequestMiddlewareResult>;
  readonly onResponse?: (
    context: HttpRequestContext,
    response: HttpResponseDraft
  ) => Effect.Effect<HttpResponseDraft>;
};

export const continueRequest = (context: HttpRequestContext): HttpRequestMiddlewareResult => ({
  _tag: "continue",
  context
});

export const respondWith = (response: HttpResponseDraft): HttpRequestMiddlewareResult => ({
  _tag: "respond",
  response
});

export const runRequestMiddlewares = (
  middlewares: ReadonlyArray<HttpMiddleware>,
  initialContext: HttpRequestContext
): Effect.Effect<HttpRequestMiddlewareResult> =>
  Effect.gen(function*() {
    let context = initialContext;
    for (const middleware of middlewares) {
      if (!middleware.onRequest) continue;
      const result = yield* middleware.onRequest(context);
      if (result._tag === "respond") return { ...result, context: result.context ?? context };
      context = result.context;
    }
    return continueRequest(context);
  });

export const runResponseMiddlewares = (
  middlewares: ReadonlyArray<HttpMiddleware>,
  context: HttpRequestContext,
  initialResponse: HttpResponseDraft
): Effect.Effect<HttpResponseDraft> =>
  Effect.gen(function*() {
    let response = initialResponse;
    for (const middleware of middlewares) {
      if (!middleware.onResponse) continue;
      response = yield* middleware.onResponse(context, response);
    }
    return response;
  });

export const mergeResponseHeaders = (
  response: HttpResponseDraft,
  headers: Readonly<Record<string, string>>
): HttpResponseDraft => ({
  ...response,
  headers: {
    ...(response.headers ?? {}),
    ...headers
  }
});
