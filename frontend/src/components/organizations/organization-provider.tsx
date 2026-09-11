"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { Organization } from "@/lib/types";
import { ErrorState } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";

const selectedOrganizationStorageKey = "flowplan.selected-organization-id";

interface OrganizationContextValue {
  organizations: Organization[];
  selectedOrganization: Organization | null;
  selectedOrganizationId: string | null;
  selectOrganization: (organizationId: string) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(
  null,
);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Explicit Project membership can survive loss of Organization membership.
  // Project access is established independently by its authenticated API.
  const directProjectRoute = /^\/projects\/[^/]+/.test(pathname);
  const [storedSelection, setStoredSelection] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : localStorage.getItem(selectedOrganizationStorageKey),
  );

  const organizationsQuery = useQuery({
    queryKey: queryKeys.organizations,
    queryFn: api.getOrganizations,
  });

  const organizations = useMemo(
    () => organizationsQuery.data ?? [],
    [organizationsQuery.data],
  );

  useEffect(() => {
    if (
      organizationsQuery.isSuccess &&
      organizations.length === 0 &&
      !directProjectRoute &&
      pathname !== "/organizations"
    ) {
      router.replace("/organizations");
    }
  }, [
    organizations.length,
    directProjectRoute,
    organizationsQuery.isSuccess,
    pathname,
    router,
  ]);

  useEffect(() => {
    if (
      organizationsQuery.error instanceof ApiError &&
      organizationsQuery.error.status === 401
    ) {
      router.replace("/sign-in");
    }
  }, [organizationsQuery.error, router]);

  const storedSelectionIsValid = organizations.some(
    (organization) => organization.id === storedSelection,
  );
  const selectedOrganizationId = storedSelectionIsValid
    ? storedSelection
    : (organizations[0]?.id ?? null);

  useEffect(() => {
    if (selectedOrganizationId) {
      localStorage.setItem(
        selectedOrganizationStorageKey,
        selectedOrganizationId,
      );
    } else {
      localStorage.removeItem(selectedOrganizationStorageKey);
    }
  }, [selectedOrganizationId]);

  const selectedOrganizationQuery = useQuery({
    queryKey: queryKeys.organization(selectedOrganizationId ?? "none"),
    queryFn: () => api.getOrganization(selectedOrganizationId!),
    enabled: Boolean(selectedOrganizationId),
  });

  const selectOrganization = useCallback((organizationId: string) => {
    setStoredSelection(organizationId);
    localStorage.setItem(selectedOrganizationStorageKey, organizationId);
  }, []);

  if (organizationsQuery.isPending) {
    return <OrganizationLoadingState message="Loading your organizations…" />;
  }

  if (organizationsQuery.isError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg">
          <ErrorState
            message={
              organizationsQuery.error instanceof ApiError
                ? organizationsQuery.error.message
                : "Unable to load your organizations."
            }
            onRetry={() => organizationsQuery.refetch()}
          />
        </div>
      </main>
    );
  }

  if (
    organizations.length === 0 &&
    !directProjectRoute &&
    pathname !== "/organizations"
  ) {
    return <OrganizationLoadingState message="Opening organization setup…" />;
  }

  if (
    organizations.length > 0 &&
    !selectedOrganizationId &&
    pathname !== "/organizations"
  ) {
    return <OrganizationLoadingState message="Selecting your workspace…" />;
  }

  if (
    selectedOrganizationId &&
    selectedOrganizationQuery.isPending &&
    !directProjectRoute &&
    pathname !== "/organizations"
  ) {
    return <OrganizationLoadingState message="Opening your workspace…" />;
  }

  if (
    selectedOrganizationId &&
    selectedOrganizationQuery.isError &&
    !directProjectRoute &&
    pathname !== "/organizations"
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg">
          <ErrorState
            message={
              selectedOrganizationQuery.error instanceof ApiError
                ? selectedOrganizationQuery.error.message
                : "Unable to open the selected organization."
            }
            onRetry={() => selectedOrganizationQuery.refetch()}
          />
        </div>
      </main>
    );
  }

  const selectedOrganization = selectedOrganizationQuery.isError
    ? null
    : (selectedOrganizationQuery.data ??
      organizations.find(
        (organization) => organization.id === selectedOrganizationId,
      ) ??
      null);

  return (
    <OrganizationContext.Provider
      value={{
        organizations,
        selectedOrganization,
        selectedOrganizationId,
        selectOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider.",
    );
  }
  return context;
}

function OrganizationLoadingState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background text-text-secondary">
      <div className="flex items-center gap-2" role="status">
        <Spinner />
        {message}
      </div>
    </main>
  );
}
