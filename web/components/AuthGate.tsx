"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx);

/** Renders children only for a signed-in user; otherwise sends them to /login/. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session === null) window.location.replace("/login/");
  }, [session]);
  if (!session) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  return <SessionCtx.Provider value={session}>{children}</SessionCtx.Provider>;
}
