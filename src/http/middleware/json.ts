import { Effect } from "effect";
import { mergeResponseHeaders, type HttpMiddleware } from "./types";

export const jsonResponseMiddleware = (): HttpMiddleware => ({
  name: "json-response",
  onResponse: (_context, response) =>
    Effect.succeed(
      response.body === undefined
        ? response
        : mergeResponseHeaders(response, {
            "Content-Type": "application/json; charset=utf-8"
          })
    )
});
