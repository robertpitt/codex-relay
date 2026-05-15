import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { HttpRestApi, type HttpRestApiHandle, type HttpRestApiOptions } from "../src/http";
import {
  continueRequest,
  defaultHttpMiddlewares,
  mergeResponseHeaders,
  type HttpMiddleware
} from "../src/http/middleware";
import { projectEndpoints, ticketEndpoints } from "../src/shared/http";
import { route } from "../src/http/resources";

const runTestEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
  Effect.runPromise(effect as Effect.Effect<A, E, never>);

const projectSummary = {
  projectId: "project_1",
  name: "Relay",
  path: "/tmp/project",
  exists: true,
  isGitRepository: true,
  relayInitialized: true,
  health: "ok" as const,
  healthMessages: [],
  activeRunCount: 0,
  swimlanes: []
};

const startTestApi = async (
  t: TestContext,
  options: Omit<Partial<HttpRestApiOptions>, "runEffect"> = {}
): Promise<HttpRestApiHandle | null> => {
  try {
    return await HttpRestApi.start({
      token: "test-token",
      runEffect: runTestEffect,
      ...options
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") {
      t.skip("Sandbox disallowed binding a localhost HTTP server.");
      return null;
    }
    throw error;
  }
};

test("Relay REST API requires the session token", async (t) => {
  const api = await startTestApi(t, {
    routes: [route(projectEndpoints.read, ({ projectPath }) => Effect.succeed({ ...projectSummary, path: projectPath }))]
  });
  if (!api) return;

  try {
    const response = await fetch(`${api.baseUrl}/api/projects/summary?projectPath=/tmp/project`);
    assert.equal(response.status, 401);
    assert.equal(new URL(api.baseUrl).hostname, "127.0.0.1");
  } finally {
    await api.close();
  }
});

test("Relay REST API validates query input and encodes successful JSON responses", async (t) => {
  const api = await startTestApi(t, {
    routes: [route(projectEndpoints.read, ({ projectPath }) => Effect.succeed({ ...projectSummary, path: projectPath }))]
  });
  if (!api) return;

  try {
    const response = await fetch(`${api.baseUrl}/api/projects/summary?projectPath=/tmp/project`, {
      headers: { Authorization: `Bearer ${api.token}` }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ...projectSummary, path: "/tmp/project" });

    const invalid = await fetch(`${api.baseUrl}/api/projects/summary`, {
      headers: { Authorization: `Bearer ${api.token}` }
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "api_validation_error");
  } finally {
    await api.close();
  }
});

test("Relay REST API validates JSON body input before handlers run", async (t) => {
  let called = 0;
  const api = await startTestApi(t, {
    routes: [
      route(ticketEndpoints.cancelAgentUpdate, () => {
        called += 1;
        return Effect.void;
      })
    ]
  });
  if (!api) return;

  try {
    const response = await fetch(`${api.baseUrl}/api/tickets/agent-update/cancel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${api.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ runId: 123 })
    });

    assert.equal(response.status, 400);
    assert.equal(called, 0);
  } finally {
    await api.close();
  }
});

test("Relay REST API runs Effect middlewares that can mutate request context and responses", async (t) => {
  const middleware: HttpMiddleware = {
    name: "test-mutator",
    onRequest: (context) => {
      const url = new URL(context.url);
      url.searchParams.set("projectPath", "/tmp/from-middleware");
      return Effect.succeed(continueRequest({ ...context, url }));
    },
    onResponse: (_context, response) =>
      Effect.succeed(mergeResponseHeaders(response, { "X-Relay-Middleware": "applied" }))
  };
  const api = await startTestApi(t, {
    middlewares: [middleware, ...defaultHttpMiddlewares()],
    routes: [route(projectEndpoints.read, ({ projectPath }) => Effect.succeed({ ...projectSummary, path: projectPath }))]
  });
  if (!api) return;

  try {
    const response = await fetch(`${api.baseUrl}/api/projects/summary`, {
      headers: { Authorization: `Bearer ${api.token}` }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-relay-middleware"), "applied");
    assert.deepEqual(await response.json(), { ...projectSummary, path: "/tmp/from-middleware" });
  } finally {
    await api.close();
  }
});
