"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AuthStatus() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    setIsSigningOut(true);
    const result = await authClient.signOut();

    if (!result.error) {
      router.replace("/sign-in");
      router.refresh();
      return;
    }

    setIsSigningOut(false);
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-text-secondary sm:inline">
        {session?.user.name ?? session?.user.email}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={isSigningOut}
        onClick={handleSignOut}
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
