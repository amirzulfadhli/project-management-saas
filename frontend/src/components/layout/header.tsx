import { AuthStatus } from "@/components/auth/auth-status";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";

export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-surface px-6">
      <OrganizationSwitcher />
      <AuthStatus />
    </header>
  );
}
