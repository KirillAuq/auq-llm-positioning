"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

/** Shows a page only to signed-in team members (or only admins). The API enforces the same rule on the server. */
export default function Guard({ admin, children }: { admin?: boolean; children: React.ReactNode }) {
  const { ready, enabled, user } = useAuth();
  if (!ready) return null;
  if (!enabled) return <p className="text-sm text-muted">Accounts are not set up on this deployment yet, so this page is unavailable.</p>;
  if (!user) return <p className="text-sm text-muted">This page is for team members. <Link href="/login" className="underline">Log in</Link> to continue.</p>;
  if (admin && user.role !== "admin") return <p className="text-sm text-muted">Only an admin can open this page.</p>;
  return <>{children}</>;
}
