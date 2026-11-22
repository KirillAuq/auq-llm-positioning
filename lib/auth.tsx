"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./client";
import { supabase } from "./session";
import type { User } from "./types";

interface AuthState {
  /** False until we know whether someone is signed in. */
  ready: boolean;
  /** False when this deployment has no accounts at all. */
  enabled: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; enabled: boolean; user: User | null }>({ ready: false, enabled: false, user: null });

  // The server decides who someone is and what role they have; the browser only holds the login.
  const refresh = useCallback(async () => {
    const c = await supabase();
    if (!c) return setState({ ready: true, enabled: false, user: null });
    const { data } = await c.auth.getSession();
    const user = data.session ? await api<{ user: User | null }>("/api/me").then((r) => r.user).catch(() => null) : null;
    setState({ ready: true, enabled: true, user });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const c = await supabase();
    if (!c) throw new Error("Accounts are not set up on this deployment.");
    const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    const { user } = await api<{ user: User | null }>("/api/me");
    if (!user) {
      await c.auth.signOut();
      throw new Error("That account has not been added to the team. Ask an admin to add you.");
    }
    setState({ ready: true, enabled: true, user });
  }, []);

  const signOut = useCallback(async () => {
    await (await supabase())?.auth.signOut();
    setState((s) => ({ ...s, user: null }));
  }, []);

  const changePassword = useCallback(async (password: string) => {
    const c = await supabase();
    if (!c) throw new Error("Accounts are not set up on this deployment.");
    const { error } = await c.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  return <AuthContext.Provider value={{ ...state, signIn, signOut, changePassword }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
