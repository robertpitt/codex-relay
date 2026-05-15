import type { RendererRunEventSink } from "../../services/run-events";
import { publishRelayHttpRunEvent } from "../RelayHttpEvents";

export const httpRunEventSink = (): RendererRunEventSink => ({
  emit: (event) => publishRelayHttpRunEvent(event)
});
