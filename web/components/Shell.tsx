"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DefinitionsButton } from "./Tiered";
import { useIsAdmin, useSession } from "./AuthGate";

const NAV = [
  { label: "Analysis", href: "/analysis/" },
  { label: "Competitive Analysis", href: "/compare/" },
  { label: "Demand", href: "/demand/" },
  { label: "Market", href: "/market/" },
  { label: "Top by category", href: "/categories/" },
];

/** The "N" tile (same mark as app/icon.svg). */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.52 }}
      className="grid shrink-0 place-items-center rounded-[8px] bg-ink font-display font-bold leading-none text-white">N</span>
  );
}

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return ref;
}

function UserMenu() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const email = session?.user.email ?? "";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Account menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}
        className="press grid h-9 w-9 place-items-center rounded-full bg-sunken text-[13px] font-semibold uppercase text-ink-2 ring-1 ring-line hover:bg-line">{email[0] ?? "·"}</button>
      {open && (
        <div role="menu" className="rise absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl bg-surface p-1.5 shadow-pop ring-1 ring-line">
          <div className="truncate px-3.5 py-2.5 text-[13px] text-muted">{email}</div>
          <button role="menuitem" type="button" onClick={async () => { await supabase().auth.signOut(); window.location.replace("/login/"); }}
            className="block w-full rounded-xl px-3.5 py-2.5 text-left text-[14px] text-ink-2 hover:bg-sunken hover:text-ink">Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Shell({ active, asOf: rawAsOf, children }: { active: string; asOf?: string; children: React.ReactNode }) {
  const isAdmin = useIsAdmin();
  // pages pass either a formatted date or an ISO day; show ISO days as "12 Oct"
  const asOf = rawAsOf && /^\d{4}-\d{2}-\d{2}$/.test(rawAsOf) ? new Date(`${rawAsOf}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : rawAsOf;
  const [menu, setMenu] = useState(false);
  const nav = isAdmin ? [...NAV, { label: "Admin", href: "/admin/" }] : NAV;
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-5 px-6">
          <a href="/analysis/" className="flex items-center gap-2.5" aria-label="Nykaa Market Intelligence, home">
            <LogoMark />
            <span className="hidden whitespace-nowrap font-display text-[15px] font-semibold tracking-tight sm:inline">Nykaa Market Intelligence</span>
          </a>
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 lg:flex">
            {nav.map((n) => (
              <a key={n.label} href={n.href} aria-current={n.label === active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] transition ${n.label === active ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {asOf && <span className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent-strong sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-accent-strong" />Data as of {asOf}</span>}
            <DefinitionsButton className="hidden whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:bg-sunken hover:text-ink md:block" />
            <UserMenu />
            <button type="button" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className="press grid h-9 w-9 place-items-center rounded-full ring-1 ring-line lg:hidden">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={menu ? "M3 3l10 10M13 3L3 13" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {menu && (
          <nav aria-label="Primary mobile" className="rise border-t border-line bg-page px-6 pb-4 pt-2 lg:hidden">
            {nav.map((n) => <a key={n.label} href={n.href} className={`block py-2.5 text-[16px] ${n.label === active ? "font-semibold text-brand" : "text-ink-2"}`}>{n.label}</a>)}
            {asOf && <div className="mt-2 text-[13px] text-muted">Data as of {asOf}</div>}
          </nav>
        )}
      </header>
      <main id="main" className="page-grid flex-1 pb-24">{children}</main>
      <footer className="border-t border-line bg-hero">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-start justify-between gap-x-12 gap-y-4 px-6 py-8 text-[12.5px] leading-relaxed text-muted">
          <div className="max-w-[560px]">
            <div className="mb-2 flex items-center gap-2.5 text-ink"><LogoMark size={22} /><span className="font-display text-[14px] font-semibold">Nykaa Market Intelligence</span></div>
            Built from public Nykaa India listings, reviews and search results, collected every night. Rankings are Nykaa&apos;s own order; shares and demand are derived from them.
          </div>
          <div className="sm:text-right">{asOf ? <>Data as of <span className="font-medium text-ink-2">{asOf}</span></> : "Refreshed nightly"}<br />Prices in ₹ · ratings out of 5<br /><DefinitionsButton className="font-medium text-accent-strong underline-offset-2 hover:underline" /></div>
        </div>
      </footer>
    </div>
  );
}
