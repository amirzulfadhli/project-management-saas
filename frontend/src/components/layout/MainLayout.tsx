import Sidebar from "./sidebar";
import Header from "./header";
import { OrganizationProvider } from "@/components/organizations/organization-provider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganizationProvider>
      <div className="flex min-h-full bg-background text-text-primary">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
        </div>
      </div>
    </OrganizationProvider>
  );
}
