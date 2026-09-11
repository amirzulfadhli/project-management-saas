"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function AuthStatus() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    setError(null);
    setIsSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Account: ${session?.user.name || session?.user.email || "current user"}`}
        className="icon-control gap-2 px-1 text-text-secondary hover:bg-hover sm:px-2"
      >
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-full border border-border bg-navigation text-xs font-semibold text-text-primary"
        >
          {(session?.user.name || session?.user.email || "?")
            .slice(0, 1)
            .toLocaleUpperCase()}
        </span>
        <span className="hidden text-sm font-medium sm:inline">Account</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Account"
        placement="header"
      >
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-text-secondary">Name</dt>
            <dd className="mt-1 break-words font-medium">
              {session?.user.name || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Email</dt>
            <dd className="mt-1 break-all">{session?.user.email}</dd>
          </div>
        </dl>
        <p className="mt-4 border-t border-border pt-3 text-xs text-text-secondary">
          This is your signed-in account. Organization roles are managed
          separately.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button
          className="mt-4 w-full"
          variant="secondary"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </Modal>
    </>
  );
}
