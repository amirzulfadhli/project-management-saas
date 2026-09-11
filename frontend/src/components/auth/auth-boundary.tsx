"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const publicAuthRoutes = new Set(["/sign-in", "/sign-up"]);

export function AuthBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const { data: session, isPending } = authClient.useSession();
  const isAuthRoute = publicAuthRoutes.has(pathname);

  useEffect(() => {
    if (isPending) return;

    const currentUserId = session?.user.id ?? null;
    if (
      previousUserId.current !== undefined &&
      previousUserId.current !== currentUserId
    ) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [isPending, queryClient, session?.user.id]);

  useEffect(() => {
    if (isPending) return;

    if (!session && !isAuthRoute) {
      router.replace("/sign-in");
    } else if (session && isAuthRoute) {
      router.replace("/");
    }
  }, [isAuthRoute, isPending, router, session]);

  if (isPending || (session && isAuthRoute) || (!session && !isAuthRoute)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-text-secondary">
        <div className="flex items-center gap-2">
          <Spinner />
          Checking your session…
        </div>
      </main>
    );
  }

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return <MainLayout key={session?.user.id}>{children}</MainLayout>;
}
