import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";
import { RpcClient, RpcMessage, RpcSerialization } from "effect/unstable/rpc";
import { startRelayHttpServer } from "../src/http";
import { relayRpcGroup } from "../src/shared/rpc";
import type { RelayHttpServerHandle, RelayHttpServerOptions } from "../src/http";

const runTestEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

const startTestServer = async (t: TestContext, options: RelayHttpServerOptions = {}): Promise<RelayHttpServerHandle | null> => {
  try {
    return await startRelayHttpServer({ token: "test-token", runEffect: runTestEffect, ...options });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") {
      t.skip("Sandbox disallowed binding a localhost HTTP server.");
      return null;
    }
    throw error;
  }
};

const makeTestHttpRpcProtocol = (
  server: RelayHttpServerHandle
): Effect.Effect<RpcClient.Protocol["Service"], never, RpcSerialization.RpcSerialization> =>
  RpcClient.Protocol.make((writeResponse) =>
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.makeUnsafe();

      return {
        send: (clientId, message) => {
          if (message._tag !== "Request") return Effect.void;
          return Effect.tryPromise(async () => {
            const response = await fetch(`${server.baseUrl}/rpc`, {
              method: "POST",
              headers: {
                "Content-Type": serialization.contentType,
                "X-Relay-Token": server.token
              },
              body: parser.encode(message) as BodyInit
            });
            assert.equal(response.status, 200);
            return parser.decode(await response.text()) as RpcMessage.FromServerEncoded[];
          }).pipe(
            Effect.orDie,
            Effect.flatMap((responses) =>
              Effect.forEach(responses, (response) => writeResponse(clientId, response), { discard: true })
            )
          );
        },
        supportsAck: false,
        supportsTransferables: false
      };
    })
  );

const callRpc = (server: RelayHttpServerHandle, tag: string, payload: unknown) =>
  runTestEffect(
    Effect.scoped(
      Effect.gen(function*() {
        const protocol = yield* makeTestHttpRpcProtocol(server).pipe(Effect.provide(RpcSerialization.layerJson));
        const client = yield* RpcClient.make(relayRpcGroup, { flatten: true }).pipe(
          Effect.provideService(RpcClient.Protocol, protocol)
        );
        const invoke = client as (tag: string, payload?: unknown) => Effect.Effect<unknown, unknown>;
        return yield* (payload === undefined ? invoke(tag) : invoke(tag, payload));
      })
    )
  );

test("Relay HTTP RPC transport requires the session token", async (t) => {
  const server = await startTestServer(t, { handlerLayer: Layer.empty });
  if (!server) return;
  try {
    const response = await fetch(`${server.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    assert.equal(response.status, 401);
    assert.equal(new URL(server.baseUrl).hostname, "127.0.0.1");
  } finally {
    await server.close();
  }
});

test("Relay HTTP RPC transport routes Effect RPC requests through handlers", async (t) => {
  const handlerLayer = relayRpcGroup.toLayerHandler("codex:status", () =>
    Effect.succeed({
      sdkAvailable: true,
      cliAvailable: true,
      cliVersion: "1.2.3",
      authenticated: true,
      message: "ok"
    })
  );
  const server = await startTestServer(t, { handlerLayer });
  if (!server) return;
  try {
    assert.deepEqual(await callRpc(server, "codex:status", undefined), {
      sdkAvailable: true,
      cliAvailable: true,
      cliVersion: "1.2.3",
      authenticated: true,
      message: "ok"
    });
  } finally {
    await server.close();
  }
});

test("Relay HTTP RPC transport rejects invalid payloads before handlers", async (t) => {
  let called = 0;
  const handlerLayer = relayRpcGroup.toLayerHandler("board:read", ({ projectPath }) => {
    called += 1;
    return Effect.succeed({
      project: {
        projectId: "project_1",
        name: "Relay",
        path: projectPath,
        exists: true,
        isGitRepository: true,
        relayInitialized: true,
        health: "ok" as const,
        healthMessages: [],
        activeRunCount: 0,
        swimlanes: []
      },
      config: null,
      columns: [],
      tickets: [],
      invalidTickets: []
    });
  });
  const server = await startTestServer(t, { handlerLayer });
  if (!server) return;
  try {
    const parser = RpcSerialization.json.makeUnsafe();
    const response = await fetch(`${server.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Token": "test-token" },
      body: parser.encode({
        _tag: "Request",
        id: "1",
        tag: "board:read",
        payload: { projectPath: 123 },
        headers: []
      }) as BodyInit
    });

    assert.equal(response.status, 200);
    const messages = parser.decode(await response.text()) as Array<{ _tag: string; exit?: { _tag: string } }>;
    assert.equal(messages.some((message) => message._tag === "Exit" && message.exit?._tag === "Failure"), true);
    assert.equal(called, 0);
  } finally {
    await server.close();
  }
});

test("Relay HTTP RPC transport maps malformed JSON at the transport boundary", async (t) => {
  const server = await startTestServer(t, { handlerLayer: Layer.empty });
  if (!server) return;
  try {
    const response = await fetch(`${server.baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Relay-Token": "test-token" },
      body: "{"
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: "relay_decode_error",
        message: "Relay API request body must be valid JSON."
      }
    });
  } finally {
    await server.close();
  }
});
