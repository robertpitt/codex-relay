import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { Effect, Schema } from "effect";
import { makeRelayIpcService, type AnyRelayIpcMethod } from "../src/main/ipc/RelayIpc";
import { relayIpcMethods } from "../src/main/ipc/methods";
import { openProjectInEditor } from "../src/main/ipc/methods/projects";
import { ipcArgs, ipcString } from "../src/main/ipc/schema";
import type { ElectronIpcInvokeHandler, ElectronIpcService } from "../src/main/electron";
import { relayIpcChannels, type RelayIpcChannel } from "../src/shared/ipc";

const runTestEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

test("typed IPC contract has exactly one schema-backed method for every channel", () => {
  const channels = Object.values(relayIpcChannels) as RelayIpcChannel[];
  const methodChannels = relayIpcMethods.map((method) => method.channel);

  assert.deepEqual([...methodChannels].sort(), [...channels].sort());
  assert.equal(new Set(methodChannels).size, channels.length);
  for (const channel of channels) {
    const method = relayIpcMethods.find((candidate) => candidate.channel === channel);
    assert.equal(typeof method?.handler, "function", `${channel} handler is registered`);
    assert.ok(method?.payload, `${channel} payload schema is registered`);
    assert.ok(method?.result, `${channel} result schema is registered`);
  }
});

test("RelayIpc registers, replaces, decodes, encodes, and removes handlers", async () => {
  const handlers = new Map<string, ElectronIpcInvokeHandler>();
  const removed: string[] = [];
  const electronIpc: ElectronIpcService = {
    handle: (channel, handler) =>
      Effect.sync(() => {
        handlers.set(channel, handler);
      }),
    removeHandler: (channel) =>
      Effect.sync(() => {
        removed.push(channel);
        handlers.delete(channel);
      })
  };
  const relayIpc = makeRelayIpcService(electronIpc, runTestEffect);
  const channel = relayIpcChannels.projectsRead;
  const method = (label: string): AnyRelayIpcMethod => ({
    channel,
    payload: ipcArgs<[string]>([ipcString]),
    result: Schema.String,
    handler: (_event, projectPath) => Effect.succeed(`${label}:${projectPath}`)
  });

  await Effect.runPromise(relayIpc.handle(method("first")));
  assert.equal(await handlers.get(channel)?.({}, "/tmp/relay"), "first:/tmp/relay");

  await Effect.runPromise(relayIpc.handle(method("second")));
  assert.equal(await handlers.get(channel)?.({}, "/tmp/relay"), "second:/tmp/relay");
  assert.deepEqual(removed, [channel, channel]);

  await Effect.runPromise(Effect.scoped(relayIpc.handleScoped(method("scoped"))));
  assert.equal(handlers.has(channel), false);
});

test("RelayIpc rejects invalid payloads before domain handlers run", async () => {
  let called = false;
  const handlers = new Map<string, ElectronIpcInvokeHandler>();
  const electronIpc: ElectronIpcService = {
    handle: (channel, handler) =>
      Effect.sync(() => {
        handlers.set(channel, handler);
      }),
    removeHandler: (channel) =>
      Effect.sync(() => {
        handlers.delete(channel);
      })
  };
  const relayIpc = makeRelayIpcService(electronIpc, runTestEffect);
  const method: AnyRelayIpcMethod = {
    channel: relayIpcChannels.projectsRead,
    payload: ipcArgs<[string]>([ipcString]),
    result: Schema.String,
    handler: () => {
      called = true;
      return Effect.succeed("ok");
    }
  };

  await Effect.runPromise(relayIpc.handle(method));
  await assert.rejects(() => handlers.get(method.channel)?.({}, 123) as Promise<unknown>);
  assert.equal(called, false);
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
