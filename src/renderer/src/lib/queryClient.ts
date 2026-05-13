import { QueryClient } from "@tanstack/react-query";

/**
 * Shared renderer query client tuned for local IPC reads. Relay data changes only
 * when the app mutates state or receives run events, so cache entries stay fresh
 * until targeted invalidation asks for new IPC data.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 0
    }
  }
});
