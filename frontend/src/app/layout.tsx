import type { Metadata } from "next";
import "./globals.css";
import { AuthBoundary } from "@/components/auth/auth-boundary";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "FlowPlan",
  description: "Focused project and task collaboration for modern teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>
          <AuthBoundary>{children}</AuthBoundary>
        </Providers>
      </body>
    </html>
  );
}
