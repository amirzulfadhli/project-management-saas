"use client";

import type { ReactNode } from "react";
import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { RealtimeProvider } from "@/lib/realtime";

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Keep server renders isolated and reuse one client in the browser so the
  // cache survives client-side navigation.
  if (isServer) {
    return new QueryClient();
  }
  browserQueryClient ??= new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  );
}
