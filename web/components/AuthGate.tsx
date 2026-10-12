"use client";

import { createContext, useContext, useEffect, useState } from "react";
import useSWR from "swr";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DetailProvider } from "./Detail";
import { ProductDrawerProvider } from "./ProductDrawer";

const SessionCtx = createContext<Session | null>(null);
export const useSession = () => useContext(SessionCtx);

/** Is this viewer an admin (app_admins)? The database enforces it on every write; this only decides what to show. */
export function useIsAdmin() {
  const session = useSession();
  const email = session?.user.email?.toLowerCase() ?? null;
  return useSWR(email ? ["admin", email] : null, async () => {
    const { data } = await supabase().from("app_admins").select("email").eq("email", email!).maybeSingle();
    return !!data;
  }, { revalidateOnFocus: false }).data ?? false;
}

/** The session this tab last saw: each page has its own gate, so moving between tabs (client-side) opens the next
 *  page at once instead of on a "Loading…" screen while the session is read again. */
let known: Session | null | undefined;

/** Renders children only for a signed-in user; otherwise sends them to /login/. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(known);
  useEffect(() => {
    supabase().auth.getSession().then(({ data }) => setSession((known = data.session)));
    const { data: sub } = supabase().auth.onAuthStateChange((_e, s) => setSession((known = s)));
    return () => sub.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session === null) window.location.replace("/login/");
  }, [session]);
  // One row per page opened, for Admin › People. Best effort: a failure never affects the page.
  const uid = session?.user.id;
  useEffect(() => {
    if (uid) supabase().from("app_visits").insert({ path: window.location.pathname }).then(() => {}, () => {});
  }, [uid]); // each page mounts its own gate, so tab changes inside the app still log one visit per page
  if (!session) return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  // The drawer provider wraps whole pages, so any component on a page (not only inside Shell) can open a product.
  return <SessionCtx.Provider value={session}><ProductDrawerProvider><DetailProvider>{children}</DetailProvider></ProductDrawerProvider></SessionCtx.Provider>;
}
