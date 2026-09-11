"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import Header from "./header";
import {
  OrganizationProvider,
  useOrganization,
} from "@/components/organizations/organization-provider";
import { OrganizationMembersModal } from "@/components/organizations/organization-members-modal";
import { Modal } from "@/components/ui/modal";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganizationProvider>
      <Shell>{children}</Shell>
    </OrganizationProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { selectedOrganization } = useOrganization();
  const [navigationPath, setNavigationPath] = useState<string | null>(null);
  const [memberOrganizationId, setMemberOrganizationId] = useState<
    string | null
  >(null);
  const closeNavigation = () => setNavigationPath(null);
  const openMembers = () => {
    closeNavigation();
    setMemberOrganizationId(selectedOrganization?.id ?? null);
  };
  return (
    <div className="flex min-h-dvh min-w-0 bg-background text-text-primary">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-surface p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside
        aria-label="Workspace navigation"
        className="sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 overflow-y-auto border-r border-border bg-navigation p-3 md:block"
      >
        <Sidebar onMembers={openMembers} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenNavigation={() => setNavigationPath(pathname)}
          navigationOpen={navigationPath === pathname}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-3 outline-none sm:p-6"
        >
          {children}
        </main>
      </div>
      <MobileNavigation
        open={navigationPath === pathname}
        onClose={closeNavigation}
        onMembers={openMembers}
      />
      {selectedOrganization &&
      memberOrganizationId === selectedOrganization.id ? (
        <OrganizationMembersModal
          key={memberOrganizationId}
          organizationId={selectedOrganization.id}
          organizationName={selectedOrganization.name}
          onClose={() => setMemberOrganizationId(null)}
        />
      ) : null}
    </div>
  );
}

function MobileNavigation({
  open,
  onClose,
  onMembers,
}: {
  open: boolean;
  onClose: () => void;
  onMembers: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const handleResize = () => {
      if (desktop.matches) onClose();
    };
    desktop.addEventListener("change", handleResize);
    window.addEventListener("popstate", onClose);
    return () => {
      desktop.removeEventListener("change", handleResize);
      window.removeEventListener("popstate", onClose);
    };
  }, [open, onClose]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workspace navigation"
      placement="navigation"
    >
      <Sidebar onNavigate={onClose} onMembers={onMembers} />
    </Modal>
  );
}
