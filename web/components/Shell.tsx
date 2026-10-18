"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { clearCached } from "@/lib/persist";
import { DefinitionsButton } from "./Tiered";
import { useIsAdmin, useSession } from "./AuthGate";
import LangToggle from "./LangToggle";
import FindBox from "./FindBox";
import { dayMonth, tr } from "@/lib/i18n";
import { noteSection, parseTrail, startTrail, subscribeTrail, trailText } from "@/lib/trail";

/** `label` is the page's id (pages pass it as `active`); `text` is what the reader sees. */
const NAV = () => [
  // Round 4 order (owner 17 Oct 2026): Nykaa as a whole first, then one level down per tab. Plan v2: the first tab is
  // the Brief; brand and product pages open from any name or from the search box
  { label: "Overview", text: tr("Brief", "브리핑"), href: "/overview/" },
  // plan v3: Categories and Brands are one Market tab
  { label: "Top by category", text: tr("Market", "시장"), href: "/categories/" },
  { label: "Analysis", text: tr("K-beauty", "K-뷰티"), href: "/analysis/" },
  { label: "Competitive Analysis", text: tr("Competitive", "경쟁 분석"), href: "/compare/" },
  { label: "Demand", text: tr("Demand & search", "수요·검색"), href: "/demand/" },
  { label: "Offers", text: tr("Offers & events", "프로모션·이벤트"), href: "/offers/" },
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
      <button type="button" aria-label={tr("Account menu", "계정 메뉴")} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}
        className="press grid h-9 w-9 place-items-center rounded-full bg-sunken text-[13px] font-semibold uppercase text-ink-2 ring-1 ring-line hover:bg-line">{email[0] ?? "·"}</button>
      {open && (
        <div role="menu" className="rise absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl bg-surface p-1.5 shadow-pop ring-1 ring-line">
          <div className="truncate px-3.5 py-2.5 text-[13px] text-muted">{email}</div>
          <button role="menuitem" type="button" onClick={async () => { await clearCached(); await supabase().auth.signOut(); window.location.replace("/login/"); }}
            className="block w-full rounded-xl px-3.5 py-2.5 text-left text-[14px] text-ink-2 hover:bg-sunken hover:text-ink">{tr("Sign out", "로그아웃")}</button>
        </div>
      )}
    </div>
  );
}

/** `active` is the tab's id; brand and product pages pass "auto" and keep the tab the reader came from highlighted
 *  (plan v4 trail, lib/trail). */
export default function Shell({ active: asked, asOf: rawAsOf, children }: { active: string; asOf?: string; children: React.ReactNode }) {
  const isAdmin = useIsAdmin();
  const isTab = asked !== "auto";
  const trailNow = useSyncExternalStore(subscribeTrail, trailText, () => null);
  const fromTab = isTab ? null : parseTrail(trailNow)?.tab ?? null;
  useEffect(() => { if (isTab) { const n = NAV().find((x) => x.label === asked); if (n) startTrail(asked, n.text); } }, [asked, isTab]);
  useEffect(() => {
    if (!isTab) return;
    // a brand or product link clicked on a tab page: remember the section it sat in (its "On this page" name)
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href^="/brand/"], a[href^="/product/"]'); if (!a) return;
      const sec = a.closest("section[id]") as HTMLElement | null;
      const navText = sec ? document.querySelector(`nav a[href="#${sec.id}"]`)?.lastChild?.textContent?.trim() : null;
      noteSection(sec?.id ?? null, navText || sec?.dataset.crumb || null);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isTab]);
  const active = isTab ? asked : fromTab ?? "Top by category";
  // pages pass either a formatted date or an ISO day; show ISO days as "12 Oct"
  const asOf = rawAsOf && /^\d{4}-\d{2}-\d{2}$/.test(rawAsOf) ? dayMonth(rawAsOf) : rawAsOf;
  const [menu, setMenu] = useState(false);
  const nav = isAdmin ? [...NAV(), { label: "Admin", text: tr("Admin", "관리"), href: "/admin/" }] : NAV();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand">{tr("Skip to content", "본문으로 건너뛰기")}</a>
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-5 px-6">
          <Link href="/overview/" className="flex items-center gap-2.5" aria-label={tr("Nykaa Market Intelligence, home", "Nykaa Market Intelligence 홈")}>
            <LogoMark />
            <span className="hidden whitespace-nowrap font-display text-[15px] font-semibold tracking-tight sm:inline xl:hidden 2xl:inline">Nykaa Market Intelligence</span>
          </Link>
          <nav aria-label={tr("Primary", "주 메뉴")} className="ml-2 hidden items-center gap-0.5 xl:flex">
            {nav.map((n) => (
              <Link key={n.label} href={n.href} aria-current={n.label === active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-2 text-[13.5px] transition ${n.label === active ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}>
                {n.text}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <FindBox />
            {asOf && <span className="hidden items-center gap-2 whitespace-nowrap rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent-strong sm:flex xl:hidden 2xl:flex"><span className="h-1.5 w-1.5 rounded-full bg-accent-strong" />{tr(`Data as of ${asOf}`, `${asOf} 기준 데이터`)}</span>}
            <DefinitionsButton className="hidden whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 ring-1 ring-line hover:bg-sunken hover:text-ink md:block xl:hidden 2xl:block" />
            <LangToggle />
            <UserMenu />
            <button type="button" aria-label={tr("Menu", "메뉴")} aria-expanded={menu} onClick={() => setMenu(!menu)} className="press grid h-9 w-9 place-items-center rounded-full ring-1 ring-line xl:hidden">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d={menu ? "M3 3l10 10M13 3L3 13" : "M2 4h12M2 8h12M2 12h12"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
        </div>
        {menu && (
          <nav aria-label={tr("Primary mobile", "주 메뉴 (모바일)")} className="rise border-t border-line bg-page px-6 pb-4 pt-2 xl:hidden">
            {nav.map((n) => <Link key={n.label} href={n.href} onClick={() => setMenu(false)} className={`block py-2.5 text-[16px] ${n.label === active ? "font-semibold text-brand" : "text-ink-2"}`}>{n.text}</Link>)}
            {asOf && <div className="mt-2 text-[13px] text-muted">{tr(`Data as of ${asOf}`, `${asOf} 기준 데이터`)}</div>}
          </nav>
        )}
      </header>
      <main id="main" className="page-grid flex-1 pb-24">{children}</main>
      <footer className="border-t border-line bg-hero">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-start justify-between gap-x-12 gap-y-4 px-6 py-8 text-[12.5px] leading-relaxed text-muted">
          <div className="max-w-[560px]">
            <div className="mb-2 flex items-center gap-2.5 text-ink"><LogoMark size={22} /><span className="font-display text-[14px] font-semibold">Nykaa Market Intelligence</span></div>
            {tr("Built from public Nykaa India listings, reviews and search results, collected every night. Rankings are Nykaa's own order; shares and demand are derived from them.",
              "Nykaa 인도의 공개 상품 목록·리뷰·검색 결과를 매일 밤 수집해 만듭니다. 순위는 Nykaa가 정한 순서이며, 점유율과 수요는 이를 바탕으로 계산합니다.")}
          </div>
          <div className="sm:text-right">{asOf ? tr(<>Data as of <span className="font-medium text-ink-2">{asOf}</span></>, <><span className="font-medium text-ink-2">{asOf}</span> 기준 데이터</>) : tr("Refreshed nightly", "매일 밤 갱신")}<br />{tr("Prices in ₹ · ratings out of 5", "가격 단위 ₹ · 평점 5점 만점")}<br /><DefinitionsButton className="font-medium text-accent-strong underline-offset-2 hover:underline" /></div>
        </div>
      </footer>
    </div>
  );
}
