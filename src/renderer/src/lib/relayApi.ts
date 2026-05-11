import type { RelayApi } from "@shared/types";

export const hasRelayApi = (): boolean => typeof window !== "undefined" && Boolean(window.relay);

export const getRelayApi = (): RelayApi => {
  if (!hasRelayApi()) {
    throw new Error("Relay API is unavailable.");
  }
  return window.relay;
};
