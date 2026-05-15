import { Effect } from "effect";
import { continueRequest, respondWith, type HttpMiddleware } from "./types";

const requestToken = (request: { readonly headers: Record<string, string | string[] | undefined> }, url: URL): string | null => {
  const authorization = request.headers.authorization;
  const authorizationValue = Array.isArray(authorization) ? authorization[0] : authorization;
  if (authorizationValue?.startsWith("Bearer ")) return authorizationValue.slice("Bearer ".length);

  const header = request.headers["x-relay-token"];
  if (typeof header === "string" && header) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  return url.searchParams.get("token");
};

export const authMiddleware = (): HttpMiddleware => ({
  name: "auth",
  onRequest: (context) =>
    Effect.succeed(
      requestToken(context.request, context.url) === context.expectedToken
        ? continueRequest(context)
        : respondWith({
            status: 401,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              error: {
                code: "unauthorized",
                message: "Relay API token is required."
              }
            })
          })
    )
});
