import type { Metadata } from "next";
import Header from "@/components/Header";
import { AuthProvider } from "@/lib/auth";
import "@fontsource-variable/space-grotesk";
import "@fontsource/fira-sans/400.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/space-mono/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Positioning Audit",
  description: "Compare how a SaaS brand describes itself with how ChatGPT, Claude and Gemini describe it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
