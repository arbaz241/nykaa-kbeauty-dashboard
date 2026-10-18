"use client";

import { supabase } from "./supabase";

/** Who may open the site (owner, 18 Oct 2026: "disable the sign in... open to other people without creating an
 *  account... make it an option to enable it when I want"). app_settings.require_login (migration 029): false = anyone
 *  with the link gets in as a guest (Supabase anonymous sign-in); true = an account is needed. Admins switch it in
 *  Admin › People. If the setting can't be read, the site asks for an account (the safe side). */
export async function requireLogin(): Promise<boolean> {
  const { data, error } = await supabase().from("app_settings").select("value").eq("key", "require_login").maybeSingle();
  return error || !data ? true : data.value !== false;
}

/** Can a visitor come in as a guest right now: the owner's switch is open AND guest (anonymous) sign-in is turned on
 *  in the Supabase project (Authentication › Sign In / Providers › "Allow anonymous sign-ins"). */
export async function guestsAllowed(): Promise<boolean> {
  if (await requireLogin()) return false;
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } });
    return !!(await r.json())?.external?.anonymous_users;
  } catch { return false; }
}

/** A random id kept in this browser, so visits from the same browser group together in Admin › People. */
export function visitorId(): string | null {
  try {
    let v = localStorage.getItem("nmi.visitor");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("nmi.visitor", v); }
    return v;
  } catch { return null; }
}
