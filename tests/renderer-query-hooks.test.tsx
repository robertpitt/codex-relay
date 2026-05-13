import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import {
  invalidateRelayTicketData,
  relayOpenProjectInEditor,
  relayQueryKeys
} from "../src/renderer/src/lib/relayQueries";
import type { ProjectOpenInEditorInput, RelayApi } from "../src/shared/types";

test("renderer query keys are stable and preserve disabled parameters", () => {
  assert.deepEqual(relayQueryKeys.projects, ["relay", "projects"]);
  assert.deepEqual(relayQueryKeys.board("/tmp/project"), relayQueryKeys.board("/tmp/project"));
  assert.deepEqual(relayQueryKeys.board(null), ["relay", "board", null]);
  assert.deepEqual(relayQueryKeys.ticket("/tmp/project", "tkt_1"), ["relay", "ticket", "/tmp/project", "tkt_1"]);
  assert.deepEqual(relayQueryKeys.runEvents("/tmp/project", "tkt_1", null), ["relay", "run-events", "/tmp/project", "tkt_1", null]);
});

test("ticket invalidation marks related renderer IPC data stale", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const projectPath = "/tmp/project";
  const ticketId = "tkt_1";
  const keys = [
    relayQueryKeys.projects,
    relayQueryKeys.board(projectPath),
    relayQueryKeys.ticket(projectPath, ticketId),
    relayQueryKeys.ticketClarifications(projectPath, ticketId),
    relayQueryKeys.ticketReferences(projectPath),
    relayQueryKeys.gitMetadata(projectPath),
    relayQueryKeys.runSummary(projectPath, ticketId),
    relayQueryKeys.runEvents(projectPath, ticketId, "run_1")
  ];

  keys.forEach((key) => queryClient.setQueryData(key, { ok: true }));

  await invalidateRelayTicketData(queryClient, projectPath, ticketId);

  for (const key of keys) {
    assert.equal(queryClient.getQueryState(key)?.isInvalidated, true, `Expected ${JSON.stringify(key)} to be invalidated`);
  }
});

test("query layer actions use the typed preload Relay API", async () => {
  const calls: ProjectOpenInEditorInput[] = [];
  const previousWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    relay: {
      projects: {
        openInEditor: async (input: ProjectOpenInEditorInput) => {
          calls.push(input);
          return { ok: true };
        }
      }
    } as Partial<RelayApi>
  };

  try {
    await relayOpenProjectInEditor({ projectPath: "/tmp/project", editorId: "vscode" });
    assert.deepEqual(calls, [{ projectPath: "/tmp/project", editorId: "vscode" }]);
  } finally {
    (globalThis as { window?: unknown }).window = previousWindow;
  }
});
