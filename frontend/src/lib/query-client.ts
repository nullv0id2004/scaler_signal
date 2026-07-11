import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton QueryClient shared between the React provider tree and
 * lib/ws.ts (which invalidates the conversation-list cache on live events
 * per docs/DESIGN.md §4 "Data flow — send message").
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});
