"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { ready, enabled, user, signIn, changePassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  if (!ready) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="display-md">Log in</h1>
        <p className="mt-2 text-sm text-muted">Accounts are not set up on this deployment yet.</p>
      </div>
    );
  }

  if (user) {
    return (
      <form className="mx-auto max-w-sm space-y-4"
        onSubmit={(e) => { e.preventDefault(); run(async () => { await changePassword(password); setPassword(""); setDone("Password changed."); }); }}>
        <div>
          <h1 className="display-md">Your account</h1>
          <p className="mt-2 text-sm text-muted">Signed in as {user.email} ({user.role === "admin" ? "admin" : "team"}).</p>
        </div>
        <div className="card space-y-3 p-5">
          <label className="label" htmlFor="new-password">New password</label>
          <input id="new-password" className="input" type="password" autoComplete="new-password" minLength={8} required
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="hint">At least 8 characters.</p>
          {error && <p className="text-sm text-high">{error}</p>}
          {done && <p className="text-sm text-chatgpt">{done}</p>}
          <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
        </div>
      </form>
    );
  }

  return (
    <form className="mx-auto max-w-sm space-y-4"
      onSubmit={(e) => { e.preventDefault(); run(async () => { await signIn(email, password); router.push("/"); }); }}>
      <div>
        <h1 className="display-md">Team log in</h1>
        <p className="mt-2 text-sm text-muted">For team members. You don&apos;t need an account to run an audit.</p>
      </div>
      <div className="card space-y-3 p-5">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-high">{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
        <p className="hint">Forgot your password? Ask an admin to set a new one.</p>
      </div>
    </form>
  );
}
