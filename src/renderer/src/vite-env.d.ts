/// <reference types="vite/client" />

import type { RelayApi } from "@shared/types";

declare global {
  interface Window {
    relay: RelayApi;
  }
}
