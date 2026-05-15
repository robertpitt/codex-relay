import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { Effect, Fiber } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import { relayRpcGroup, relayRpcTags } from "../src/shared/rpc";
import {
  makeRelayIpcRpcServerProtocol,
  relayRpcClientMessageChannel,
  relayRpcServerMessageChannel,
  type RelayIpcRouterService,
  type RelayIpcRpcServerPacket
} from "../src/ipc";
import { openProjectInEditor } from "../src/services/rpc/handlers";
import type { IpcMainRouterEvent, IpcMainRouterListener } from "../src/platform";

const runTestEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

test("Relay RPC group keeps one schema-backed RPC for every legacy tag", () => {
  const expected = Object.values(relayRpcTags).sort();
  const actual = [...relayRpcGroup.requests.keys()].sort();

  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, expected.length);

  for (const tag of expected) {
    const rpc = relayRpcGroup.requests.get(tag);
    assert.ok(rpc, `${tag} RPC is registered`);
    assert.ok("payloadSchema" in rpc, `${tag} payload schema is registered`);
    assert.ok("successSchema" in rpc, `${tag} success schema is registered`);
    assert.ok("errorSchema" in rpc, `${tag} error schema is registered`);
  }
});

test("Electron IPC transport forwards encoded RPC requests and responses", async () => {
  let listener: IpcMainRouterListener | null = null;
  const sent: RelayIpcRpcServerPacket[] = [];
  const ipcRouter: RelayIpcRouterService = {
    on: (channel, nextListener) =>
      Effect.sync(() => {
        assert.equal(channel, relayRpcClientMessageChannel);
        listener = nextListener;
        return () => {
          listener = null;
        };
      })
  };
  const event: IpcMainRouterEvent = {
    sender: {
      id: 42,
      isDestroyed: () => false,
      send: (channel, payload) => {
        assert.equal(channel, relayRpcServerMessageChannel);
        sent.push(payload as RelayIpcRpcServerPacket);
      }
    }
  };
  const handlers = relayRpcGroup.toLayerHandler("projects:read", ({ projectPath }) =>
    Effect.succeed({
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
    })
  );

  const serverFiber = await runTestEffect(
    Effect.gen(function*() {
      const protocol = yield* makeRelayIpcRpcServerProtocol(ipcRouter, runTestEffect);
      return yield* RpcServer.make(relayRpcGroup, { disableFatalDefects: true }).pipe(
        Effect.provideService(RpcServer.Protocol, protocol),
        Effect.provide(handlers),
        Effect.forkDetach({ startImmediately: true })
      );
    })
  );

  try {
    const emit = listener as IpcMainRouterListener | null;
    assert.ok(emit);
    emit(event, {
      clientId: 7,
      message: {
        _tag: "Request",
        id: "1",
        tag: "projects:read",
        payload: { projectPath: "/tmp/relay" },
        headers: []
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(sent[0]?.clientId, 7);
    assert.equal(sent.some((packet) => packet.message._tag === "Exit"), true);
  } finally {
    await runTestEffect(Fiber.interrupt(serverFiber));
  }
});

test("Electron IPC transport forwards encoded RPC interrupts", async () => {
  let listener: IpcMainRouterListener | null = null;
  const forwarded: Array<{ readonly clientId: number; readonly message: { readonly _tag: string; readonly requestId?: string } }> = [];
  const ipcRouter: RelayIpcRouterService = {
    on: (_channel, nextListener) =>
      Effect.sync(() => {
        listener = nextListener;
        return () => {
          listener = null;
        };
      })
  };
  const event: IpcMainRouterEvent = {
    sender: {
      id: 44,
      isDestroyed: () => false,
      send: () => undefined
    }
  };

  const runFiber = await runTestEffect(
    Effect.gen(function*() {
      const protocol = yield* makeRelayIpcRpcServerProtocol(ipcRouter, runTestEffect);
      return yield* protocol.run((clientId, message) =>
        Effect.sync(() => {
          forwarded.push({ clientId, message });
        })
      ).pipe(Effect.forkDetach({ startImmediately: true }));
    })
  );

  try {
    const emit = listener as IpcMainRouterListener | null;
    assert.ok(emit);
    emit(event, { clientId: 9, message: { _tag: "Interrupt", requestId: "1" } });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(forwarded, [{ clientId: 1, message: { _tag: "Interrupt", requestId: "1" } }]);
  } finally {
    await runTestEffect(Fiber.interrupt(runFiber));
  }
});

test("Electron IPC transport lets RPC schema rejection happen before handlers run", async () => {
  let listener: IpcMainRouterListener | null = null;
  let called = false;
  const sent: RelayIpcRpcServerPacket[] = [];
  const ipcRouter: RelayIpcRouterService = {
    on: (_channel, nextListener) =>
      Effect.sync(() => {
        listener = nextListener;
        return () => undefined;
      })
  };
  const event: IpcMainRouterEvent = {
    sender: {
      id: 43,
      isDestroyed: () => false,
      send: (_channel, payload) => {
        sent.push(payload as RelayIpcRpcServerPacket);
      }
    }
  };
  const handlers = relayRpcGroup.toLayerHandler("projects:read", () => {
    called = true;
    return Effect.die("handler should not run");
  });

  const serverFiber = await runTestEffect(
    Effect.gen(function*() {
      const protocol = yield* makeRelayIpcRpcServerProtocol(ipcRouter, runTestEffect);
      return yield* RpcServer.make(relayRpcGroup, { disableFatalDefects: true }).pipe(
        Effect.provideService(RpcServer.Protocol, protocol),
        Effect.provide(handlers),
        Effect.forkDetach({ startImmediately: true })
      );
    })
  );

  try {
    const emit = listener as IpcMainRouterListener | null;
    assert.ok(emit);
    emit(event, {
      clientId: 8,
      message: {
        _tag: "Request",
        id: "1",
        tag: "projects:read",
        payload: { projectPath: 123 },
        headers: []
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(called, false);
    assert.equal(sent.length > 0, true);
  } finally {
    await runTestEffect(Fiber.interrupt(serverFiber));
  }
});

test("project open-in-editor maps editor ids to commands and returns success after spawn", async () => {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const spawnEditorProcess = (command: string, args: readonly string[]): ChildProcess => {
    calls.push({ command, args });
    const child = new EventEmitter() as ChildProcess;
    child.unref = () => child;
    queueMicrotask(() => child.emit("spawn"));
    return child;
  };

  assert.deepEqual(await openProjectInEditor({ projectPath: "/tmp/relay", editorId: "vscode" }, spawnEditorProcess), { ok: true });
  assert.deepEqual(await openProjectInEditor({ projectPath: "/tmp/relay", editorId: "cursor" }, spawnEditorProcess), { ok: true });
  assert.deepEqual(calls, [
    { command: "code", args: ["/tmp/relay"] },
    { command: "cursor", args: ["/tmp/relay"] }
  ]);
});

test("project open-in-editor returns failure result when spawn reports an error", async () => {
  const spawnEditorProcess = (_command: string, _args: readonly string[]): ChildProcess => {
    const child = new EventEmitter() as ChildProcess;
    child.unref = () => child;
    queueMicrotask(() => child.emit("error", new Error("spawn code ENOENT")));
    return child;
  };

  const result = await openProjectInEditor({ projectPath: "/tmp/relay", editorId: "vscode" }, spawnEditorProcess);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /VS Code/);
    assert.match(result.message, /`code` command/);
    assert.match(result.message, /spawn code ENOENT/);
  }
});
