"use client";

import { createContext, Fragment, useContext, useEffect, useState } from "react";
import useSWR from "swr";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loadLang, tr, useLang } from "@/lib/i18n";
import { useDictionary } from "@/lib/dict";
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
  const lang = useLang();
  const dictReady = useDictionary();
  useEffect(loadLang, []);
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
  if (!session || !dictReady) return <div className="grid min-h-screen place-items-center text-sm text-muted">{tr("Loading…", "불러오는 중…")}</div>;
  // The drawer provider wraps whole pages, so any component on a page (not only inside Shell) can open a product.
  // Keyed on the language: switching re-mounts the page, so text built once (memoised findings, labels) is rebuilt in
  // the new language. Data stays in SWR's cache, so nothing is fetched again.
  return <SessionCtx.Provider value={session}><Fragment key={lang}><ProductDrawerProvider><DetailProvider>{children}</DetailProvider></ProductDrawerProvider></Fragment></SessionCtx.Provider>;
}
