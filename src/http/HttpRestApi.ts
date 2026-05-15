import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Effect } from "effect";
import {
  decodeHttpPayload,
  isHttpPayloadSchemaError,
  type ApiErrorResponse
} from "@shared/http";
import { errorMessage } from "../domain/errors";
import { logInfo } from "../runtime/Logging";
import { addRelayHttpRunEventClient } from "./RelayHttpEvents";
import {
  corsHeadersForOrigin,
  defaultHttpMiddlewares,
  runRequestMiddlewares,
  runResponseMiddlewares,
  type HttpMiddleware,
  type HttpRequestContext,
  type HttpResponseDraft
} from "./middleware";
import { httpResourceRoutes, type HttpResourceRoute } from "./resources";

export type HttpRestApiOptions = {
  readonly host?: string;
  readonly port?: number;
  readonly token?: string;
  readonly routes?: ReadonlyArray<HttpResourceRoute>;
  readonly middlewares?: ReadonlyArray<HttpMiddleware>;
  readonly runEffect: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;
};

export type HttpRestApiHandle = {
  readonly baseUrl: string;
  readonly token: string;
  readonly server: Server;
  readonly close: () => Promise<void>;
};

type ApiFailure = {
  readonly status: number;
  readonly code: string;
  readonly message: string;
};

const defaultPort = (): number => {
  const configured = Number.parseInt(process.env.RELAY_API_PORT ?? "", 10);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return process.env.ELECTRON_RENDERER_URL ? 17654 : 0;
};

const defaultToken = (port: number): string => process.env.RELAY_API_TOKEN ?? (port === 17654 ? "relay-dev" : randomBytes(24).toString("base64url"));

const serverAddress = (server: Server, host: string): string => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Relay HTTP API did not report a listening address.");
  return `http://${host}:${address.port}`;
};

const jsonResponse = (status: number, body: unknown): HttpResponseDraft => ({
  status,
  body: JSON.stringify(body)
});

const noContentResponse = (): HttpResponseDraft => ({ status: 204 });

const apiErrorResponse = (failure: ApiFailure): HttpResponseDraft =>
  jsonResponse(failure.status, {
    error: {
      code: failure.code,
      message: failure.message
    }
  } satisfies ApiErrorResponse);

const writeResponse = (response: ServerResponse, draft: HttpResponseDraft): void => {
  response.writeHead(draft.status, draft.headers ?? {});
  response.end(draft.body);
};

const writeMiddlewareResponse = async (
  response: ServerResponse,
  middlewares: ReadonlyArray<HttpMiddleware>,
  context: HttpRequestContext,
  draft: HttpResponseDraft
): Promise<void> => {
  writeResponse(response, await Effect.runPromise(runResponseMiddlewares(middlewares, context, draft)));
};

const failureFromError = (error: unknown): ApiFailure => {
  if (isHttpPayloadSchemaError(error)) {
    return { status: 400, code: "api_validation_error", message: errorMessage(error) };
  }
  if (error instanceof SyntaxError) {
    return { status: 400, code: "api_validation_error", message: "Relay API request body must be valid JSON." };
  }
  return { status: 500, code: "api_error", message: errorMessage(error) };
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) return undefined;
  return JSON.parse(body);
};

const queryObject = (url: URL): Record<string, string> => {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key !== "token") query[key] = value;
  }
  return query;
};

const routeFor = (
  routes: ReadonlyArray<HttpResourceRoute>,
  method: string | undefined,
  pathname: string
): HttpResourceRoute | undefined =>
  routes.find((route) => route.endpoint.method === method && route.endpoint.path === pathname);

const decodeRouteRequest = async (route: HttpResourceRoute, request: IncomingMessage, url: URL): Promise<unknown> => {
  const rule = route.endpoint.request;
  if (!rule) return undefined;
  const payload = rule.location === "query" ? queryObject(url) : await readJsonBody(request);
  return decodeHttpPayload(rule.schema, payload);
};

const handleRoute = async (
  route: HttpResourceRoute,
  request: IncomingMessage,
  url: URL,
  runEffect: HttpRestApiOptions["runEffect"]
): Promise<HttpResponseDraft> => {
  const input = await decodeRouteRequest(route, request, url);
  const result = await runEffect(route.handle(input as never));
  if (!route.endpoint.response) return noContentResponse();
  return jsonResponse(200, decodeHttpPayload(route.endpoint.response, result));
};

export const startHttpRestApi = async ({
  host = "127.0.0.1",
  port = defaultPort(),
  token = defaultToken(port),
  routes = httpResourceRoutes,
  middlewares = defaultHttpMiddlewares(),
  runEffect
}: HttpRestApiOptions): Promise<HttpRestApiHandle> => {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const context: HttpRequestContext = {
      request,
      url,
      expectedToken: token,
      corsHeaders: corsHeadersForOrigin(request.headers.origin)
    };

    const requestMiddlewareResult = await Effect.runPromise(runRequestMiddlewares(middlewares, context));
    if (requestMiddlewareResult._tag === "respond") {
      await writeMiddlewareResponse(
        response,
        middlewares,
        requestMiddlewareResult.context ?? context,
        requestMiddlewareResult.response
      );
      return;
    }

    const activeContext = requestMiddlewareResult.context;
    if (activeContext.request.method === "GET" && activeContext.url.pathname === "/api/events") {
      const cleanup = addRelayHttpRunEventClient(response, activeContext.corsHeaders);
      request.on("close", cleanup);
      return;
    }

    const route = routeFor(routes, activeContext.request.method, activeContext.url.pathname);
    if (!route) {
      await writeMiddlewareResponse(
        response,
        middlewares,
        activeContext,
        apiErrorResponse({
          status: 404,
          code: "not_found",
          message: "Relay API route was not found."
        })
      );
      return;
    }

    try {
      await writeMiddlewareResponse(
        response,
        middlewares,
        activeContext,
        await handleRoute(route, request, activeContext.url, runEffect)
      );
    } catch (error) {
      await writeMiddlewareResponse(response, middlewares, activeContext, apiErrorResponse(failureFromError(error)));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const baseUrl = serverAddress(server, host);
  await logInfo("http", "Relay REST API listening", {
    baseUrl,
    token
  });

  return {
    baseUrl,
    token,
    server,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
};

export const HttpRestApi = {
  start: startHttpRestApi
} as const;
