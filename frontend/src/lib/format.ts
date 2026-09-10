import type { Tone } from "@/components/ui/badge";

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? `Priority ${priority}`;
}

export function priorityTone(priority: number): Tone {
  switch (priority) {
    case 4:
      return "danger";
    case 3:
      return "warning";
    case 2:
      return "primary";
    default:
      return "neutral";
  }
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
