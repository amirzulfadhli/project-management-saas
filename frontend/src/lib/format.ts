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