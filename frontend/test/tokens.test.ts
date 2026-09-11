import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "tailwindcss";

test("numeric spacing compiles consistently instead of making h-10 96px", async () => {
  const css = readFileSync(
    resolve(__dirname, "../src/app/globals.css"),
    "utf8",
  );
  expect(css).not.toMatch(/--spacing-\d+\s*:/);
  const compiler = await compile(
    css.replace('@import "tailwindcss";', "@tailwind utilities;"),
  );
  const result = compiler.build(["h-10", "w-8", "p-6"]);
  expect(result).toContain("--spacing: 0.25rem");
  expect(result).toContain("height: calc(var(--spacing) * 10)");
  expect(result).toContain("width: calc(var(--spacing) * 8)");
  expect(result).toContain("padding: calc(var(--spacing) * 6)");
});

test("touch sizing, focus and reduced-motion are shared rules", () => {
  const css = readFileSync(
    resolve(__dirname, "../src/app/globals.css"),
    "utf8",
  );
  expect(css).toContain("--touch-target: 2.75rem");
  expect(css).toContain("@media (pointer: coarse)");
  expect(css).toContain(":focus-visible");
  expect(css).toContain("prefers-reduced-motion: reduce");
});
