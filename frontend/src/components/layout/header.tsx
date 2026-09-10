import { AuthStatus } from "@/components/auth/auth-status";
import { OrganizationSwitcher } from "@/components/organizations/organization-switcher";
import { NotificationBell } from "@/components/notifications/notification-bell";

export default function Header() {
  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b border-border bg-surface px-2 sm:gap-4 sm:px-6">
      <OrganizationSwitcher />
      <div className="flex items-center gap-2">
        <NotificationBell />
        <AuthStatus />
      </div>
    </header>
  );
}
