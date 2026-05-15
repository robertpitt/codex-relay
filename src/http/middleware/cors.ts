import { Effect } from "effect";
import { continueRequest, mergeResponseHeaders, respondWith, type HttpMiddleware } from "./types";

export const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export const corsHeadersForOrigin = (origin: string | undefined): Record<string, string> => {
  if (!origin || !localhostOriginPattern.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
};

export const corsMiddleware = (): HttpMiddleware => ({
  name: "cors",
  onRequest: (context) =>
    Effect.succeed(
      context.request.method === "OPTIONS"
        ? respondWith({
            status: 204,
            headers: {
              ...context.corsHeaders,
              "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
              "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Relay-Token"
            }
          })
        : continueRequest(context)
    ),
  onResponse: (context, response) => Effect.succeed(mergeResponseHeaders(response, context.corsHeaders))
});
