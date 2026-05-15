import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Queue, Scope } from "effect";
import { RpcMessage, RpcServer, RpcSerialization } from "effect/unstable/rpc";
import { relayRpcGroup } from "@shared/rpc";
import { relayTransportFailureFromError, transportBodyDecodeError } from "../ipc";
import { logInfo } from "../services/logger";
import { runBackendEffect } from "../runtime";
import { ElectronApp } from "../platform";
import { RelayRpcHandlersLive } from "../services/rpc/handlers";
import { addRelayHttpRunEventClient } from "./RelayHttpEvents";

export type RelayHttpServerOptions = {
  readonly host?: string;
  readonly port?: number;
  readonly token?: string;
  readonly handlerLayer?: Layer.Layer<never, unknown, unknown>;
  readonly runEffect: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;
};

export type RelayHttpServerHandle = {
  readonly baseUrl: string;
  readonly token: string;
  readonly server: Server;
  readonly close: () => Promise<void>;
};

type JsonErrorResponse = { ok: false; error: { code: string; message: string } };

type PendingHttpRpcClient = {
  readonly responses: Queue.Queue<RpcMessage.FromServerEncoded, Cause.Done>;
};

const corsHeaders = (origin: string | undefined): Record<string, string> => {
  if (!origin || !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
};

const sendJsonError = (request: IncomingMessage, response: ServerResponse, status: number, body: JsonErrorResponse): void => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(request.headers.origin)
  });
  response.end(JSON.stringify(body));
};

const sendRpcBody = (request: IncomingMessage, response: ServerResponse, body: string | Uint8Array): void => {
  response.writeHead(200, {
    "Content-Type": RpcSerialization.json.contentType,
    ...corsHeaders(request.headers.origin)
  });
  response.end(body);
};

const readTextBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const requestToken = (request: IncomingMessage, url: URL): string | null => {
  const header = request.headers["x-relay-token"];
  if (typeof header === "string" && header) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  return url.searchParams.get("token");
};

const requestHeaders = (request: IncomingMessage): ReadonlyArray<[string, string]> => {
  const headers: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.push([key, value]);
    } else if (Array.isArray(value)) {
      for (const item of value) headers.push([key, item]);
    }
  }
  return headers;
};

const serverAddress = (server: Server, host: string): string => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Relay HTTP server did not report a listening address.");
  return `http://${host}:${address.port}`;
};

const makeRelayHttpRpcBridge = (
  handlerLayer: Layer.Layer<never, unknown, unknown>
): Effect.Effect<{
  readonly handle: (rawBody: string, headers: ReadonlyArray<[string, string]>) => Effect.Effect<string | Uint8Array, unknown, unknown>;
  readonly close: () => Effect.Effect<void>;
}, unknown, unknown> =>
  Effect.gen(function*() {
    const serialization = RpcSerialization.json;
    const disconnects = yield* Queue.make<number>();
    const clients = new Map<number, PendingHttpRpcClient>();
    const clientIds = new Set<number>();
    const ready = yield* Deferred.make<void>();
    const serverScope = yield* Scope.make();
    const handlerContext = yield* Layer.buildWithScope(handlerLayer, serverScope);
    let nextClientId = 1;
    let writeClientRequest: (
      clientId: number,
      message: RpcMessage.FromClientEncoded
    ) => Effect.Effect<void, unknown, unknown> = () => Effect.void;

    const protocol = yield* RpcServer.Protocol.make((writeRequest) =>
      Effect.sync(() => {
        writeClientRequest = writeRequest;
        return {
          disconnects,
        send: (clientId, message) => {
          const client = clients.get(clientId);
          if (!client) return Effect.void;
          const offer = Queue.offer(client.responses, message);
          return message._tag === "Exit" || message._tag === "Defect" ? Effect.andThen(offer, Queue.end(client.responses)) : offer;
        },
        end: (clientId) => {
          const client = clients.get(clientId);
          return client ? Queue.end(client.responses) : Effect.void;
        },
          clientIds: Effect.sync(() => clientIds),
          initialMessage: Effect.succeedNone,
          supportsAck: false,
          supportsTransferables: false,
          supportsSpanPropagation: false
        };
      })
    );
    const readyProtocol: RpcServer.Protocol["Service"] = {
      ...protocol,
      run: (handler) => Effect.andThen(Deferred.succeed(ready, undefined), protocol.run(handler))
    };

    const rpcFiber = yield* RpcServer.make(relayRpcGroup, { spanPrefix: "RelayRpc/Http" }).pipe(
      Effect.provideService(RpcServer.Protocol, readyProtocol),
      Effect.provideContext(handlerContext),
      Effect.forkDetach({ startImmediately: true })
    );
    yield* Deferred.await(ready);

    return {
      handle: (rawBody, headers) =>
        Effect.gen(function*() {
          const parser = serialization.makeUnsafe();
          const decoded = yield* Effect.try({
            try: () => parser.decode(rawBody) as ReadonlyArray<RpcMessage.FromClientEncoded>,
            catch: transportBodyDecodeError
          });
          const clientId = nextClientId++;
          const client = { responses: yield* Queue.unbounded<RpcMessage.FromServerEncoded, Cause.Done>() } satisfies PendingHttpRpcClient;
          clients.set(clientId, client);
          clientIds.add(clientId);

          try {
            for (const message of decoded) {
              const request =
                message._tag === "Request" ? { ...message, headers: headers.concat(message.headers) } satisfies RpcMessage.RequestEncoded : message;
              yield* writeClientRequest(clientId, request);
            }
            yield* writeClientRequest(clientId, { _tag: "Eof" });
            const responses = yield* Queue.collect(client.responses);
            return parser.encode(responses) ?? "[]";
          } finally {
            clients.delete(clientId);
            clientIds.delete(clientId);
            Queue.offerUnsafe(disconnects, clientId);
          }
        }),
      close: () => Effect.andThen(Fiber.interrupt(rpcFiber), Scope.close(serverScope, Exit.void))
    };
  });

export const startRelayHttpServer = async ({
  host = "127.0.0.1",
  port = 0,
  token = randomBytes(24).toString("base64url"),
  handlerLayer = RelayRpcHandlersLive,
  runEffect
}: RelayHttpServerOptions): Promise<RelayHttpServerHandle> => {
  const bridge = await runEffect(makeRelayHttpRpcBridge(handlerLayer));

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const cors = corsHeaders(request.headers.origin);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...cors,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Relay-Token"
      });
      response.end();
      return;
    }

    if (requestToken(request, url) !== token) {
      sendJsonError(request, response, 401, { ok: false, error: { code: "unauthorized", message: "Relay API token is required." } });
      return;
    }

    if (request.method === "GET" && url.pathname === "/events") {
      const cleanup = addRelayHttpRunEventClient(response, cors);
      request.on("close", cleanup);
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/rpc") {
      sendJsonError(request, response, 404, { ok: false, error: { code: "not_found", message: "Relay RPC route was not found." } });
      return;
    }

    try {
      const rawBody = await readTextBody(request);
      const body = await runEffect(bridge.handle(rawBody, requestHeaders(request)));
      sendRpcBody(request, response, body);
    } catch (error) {
      const failure = relayTransportFailureFromError(error);
      sendJsonError(request, response, failure.status, { ok: false, error: { code: failure.code, message: failure.message } });
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
  const rendererBaseUrl =
    (await runBackendEffect(ElectronApp.use((electronApp) => electronApp.envVar("ELECTRON_RENDERER_URL")))) ?? "http://localhost:5173";
  await logInfo("http", "Relay local RPC listening", {
    baseUrl,
    token,
    rendererUrl: `${rendererBaseUrl}/?relayRpcBaseUrl=${encodeURIComponent(baseUrl)}&relayToken=${encodeURIComponent(token)}`
  });

  return {
    baseUrl,
    token,
    server,
    close: async () => {
      await runEffect(bridge.close());
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
};
