import type { SVGProps } from "react";

const paths = {
  home: "m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7",
  projects: "M3 6h7l2 2h9v12H3V6Z M3 6V4h7l2 2",
  tasks: "m3 6 2 2 4-4m-6 9 2 2 4-4m-6 9 2 2 4-4M12 6h9M12 13h9M12 20h9",
  members:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  organizations: "M4 21V3h12v18M2 21h20M16 9h4v12M8 7h4M8 11h4M8 15h4",
  menu: "M4 6h16M4 12h16M4 18h16",
} as const;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
