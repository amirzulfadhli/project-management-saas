import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-surface p-8">
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-primary">FlowPlan</p>
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          <p className="mt-2 text-sm text-text-secondary">{description}</p>
        </div>
        {children}
        <div className="mt-6 text-center text-sm text-text-secondary">
          {footer}
        </div>
      </section>
    </main>
  );
}
