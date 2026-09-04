import Link from "next/link";

const navigation = [
  { href: "/", label: "Dashboard", mark: "D" },
  { href: "/organizations", label: "Organizations", mark: "O" },
  { href: "/projects", label: "Projects", mark: "P" },
  { href: "/tasks", label: "Tasks", mark: "T" },
] as const;

export default function Sidebar() {
  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center justify-center border-b border-border">
        <Link href="/" className="flex items-center gap-3">
          <span className="text-xl font-semibold text-primary">FlowPlan</span>
        </Link>
      </div>
      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3 pt-4"
        aria-label="Primary navigation"
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-text-secondary hover:bg-hover hover:text-text-primary"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden="true"
            >
              {item.mark}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
