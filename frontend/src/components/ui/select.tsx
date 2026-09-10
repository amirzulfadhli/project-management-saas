import type { SelectHTMLAttributes } from "react";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      {...props}
    >
      {children}
    </select>
  );
}
