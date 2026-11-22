"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function Header() {
  const { ready, enabled, user, signOut } = useAuth();
  return (
    <header className="no-print border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">LLM Positioning Audit</Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <Link href="/" className="hover:text-ink">Audit</Link>
          {user && <Link href="/reports" className="hover:text-ink">Reports</Link>}
          {user?.role === "admin" && <Link href="/admin" className="hover:text-ink">Admin</Link>}
          {user?.role === "admin" && <Link href="/settings" className="hover:text-ink">Settings</Link>}
          {ready && enabled && !user && <Link href="/login" className="btn py-1.5">Log in</Link>}
          {user && (
            <>
              <Link href="/login" className="hover:text-ink" title="Account">{user.email}</Link>
              <button className="btn py-1.5" onClick={() => signOut().then(() => window.location.assign("/"))}>Log out</button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
