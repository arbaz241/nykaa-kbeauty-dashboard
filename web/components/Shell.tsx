"use client";

import { supabase } from "@/lib/supabase";
import { useIsAdmin, useSession } from "./AuthGate";

const NAV = [
  { label: "Analysis", href: "/analysis/", live: true },
  { label: "Compare", href: "/compare/", live: true },
  { label: "Demand", href: "/demand/", live: true },
  { label: "Search & Ads", href: "/search/", live: true },
  { label: "Market", href: "/market/", live: true },
  { label: "Top by category", href: "/categories/", live: true },
];

export default function Shell({ active, asOf, children }: { active: string; asOf?: string; children: React.ReactNode }) {
  const session = useSession();
  const isAdmin = useIsAdmin();
  const nav = isAdmin ? [...NAV, { label: "Admin", href: "/admin/", live: true }] : NAV;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-6">
          <div className="flex items-center gap-2.5">
            <span className="h-5 w-5 rounded-[5px] bg-ink" />
            <span className="whitespace-nowrap font-display text-[14px] font-semibold tracking-tight">Nykaa Market Intelligence</span>
          </div>
          <nav className="flex items-center gap-1">
            {nav.map((n) => (
              <a key={n.label} href={n.live ? n.href : undefined} title={n.live ? undefined : "Coming in the next build"}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13.5px] transition ${n.label === active ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : n.live ? "text-ink-2 hover:text-ink" : "cursor-default text-muted/60"}`}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[12.5px] text-muted">
            {asOf && <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full bg-good" />Data as of {asOf}</span>}
            <span className="hidden 2xl:inline">{session?.user.email}</span>
            <button title={session?.user.email} onClick={async () => { await supabase().auth.signOut(); window.location.replace("/login/"); }} className="whitespace-nowrap rounded-lg px-2.5 py-1 text-ink-2 ring-1 ring-line hover:bg-surface">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1320px] px-6 pb-24 pt-8">{children}</main>
    </div>
  );
}
