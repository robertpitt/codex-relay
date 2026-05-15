import type { ServerResponse } from "node:http";
import { Effect, Layer } from "effect";
import type { RendererRunEvent } from "@shared/schemas";
import { RunEventSink, rendererRunEventFromRelayEvent, writeRunLogEffect } from "../services/run-events";

const clients = new Set<ServerResponse>();

const writeSseEvent = (response: ServerResponse, eventName: string, data: unknown): void => {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const addRelayHttpRunEventClient = (response: ServerResponse, headers: Record<string, string> = {}): (() => void) => {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...headers
  });
  response.write(": connected\n\n");
  clients.add(response);

  const heartbeat = setInterval(() => {
    if (response.destroyed) return;
    response.write(": heartbeat\n\n");
  }, 30000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(response);
    response.end();
  };
};

export const publishRelayHttpRunEvent = (event: RendererRunEvent): void => {
  for (const client of clients) {
    if (client.destroyed) {
      clients.delete(client);
      continue;
    }
    writeSseEvent(client, "run-event", event);
  }
};

export const HttpRunEventSinkLive = Layer.succeed(RunEventSink)({
  emit: (projectPath, ticketId, runId, threadId, event) =>
    Effect.gen(function*() {
      yield* writeRunLogEffect(projectPath, ticketId, runId, threadId, event);
      publishRelayHttpRunEvent(rendererRunEventFromRelayEvent(projectPath, ticketId, runId, event));
    })
});
