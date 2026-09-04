export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-text-secondary/30 border-t-text-secondary ${className ?? ""}`}
    />
  );
}