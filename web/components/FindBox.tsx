"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { brandHref, productHref } from "./Links";
import { useShelfProducts } from "@/lib/data";
import { norm } from "@/lib/brands";
import { shortName } from "@/lib/format";
import { tr } from "@/lib/i18n";

/** The header search (plan v2): type a brand or product, open its page. Covers every product seen on a tracked
 *  shelf in the last 120 days. */
export default function FindBox() {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const router = useRouter(); const box = useRef<HTMLDivElement>(null);
  const products = useShelfProducts();
  const hits = useMemo(() => {
    const k = norm(q); if (k.length < 2) return [];
    const ps = products.data ?? [];
    const brands = [...new Set(ps.map((p) => p.brand))].filter((b) => norm(b).includes(k)).sort((a, b) => (norm(a).startsWith(k) ? 0 : 1) - (norm(b).startsWith(k) ? 0 : 1) || a.length - b.length).slice(0, 4)
      .map((b) => ({ kind: "brand" as const, label: b, sub: tr("Brand", "브랜드"), href: brandHref(b) }));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const prods = ps.filter((p) => words.every((w) => `${p.brand} ${p.name}`.toLowerCase().includes(w))).slice(0, 7)
      .map((p) => ({ kind: "product" as const, label: shortName(p.name, p.brand), sub: p.brand, href: productHref(p.product_id) }));
    return [...brands, ...prods];
  }, [q, products.data]);
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  return (
    <div ref={box} className="relative hidden md:block" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <input id="findbox" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && hits[hi]) go(hits[hi].href);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={tr("Find a brand or product", "브랜드·제품 찾기")} aria-label={tr("Find a brand or product", "브랜드·제품 찾기")}
        className="w-[200px] rounded-full bg-surface px-4 py-1.5 text-[13px] ring-1 ring-line outline-none placeholder:text-muted focus:ring-brand 2xl:w-[260px]" />
      {open && q.length >= 2 && (
        <div className="rise absolute right-0 top-full z-40 mt-2 w-[360px] rounded-2xl bg-surface p-1.5 shadow-pop ring-1 ring-line" role="listbox">
          {hits.length ? hits.map((h, i) => (
            <button key={h.href} role="option" aria-selected={i === hi} onMouseEnter={() => setHi(i)} onClick={() => go(h.href)}
              className={`flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] ${i === hi ? "bg-sunken" : ""}`}>
              <span className="min-w-0 truncate">{h.kind === "brand" ? <b>{h.label}</b> : h.label}</span>
              <span className="shrink-0 text-[11.5px] text-muted">{h.sub}</span>
            </button>
          )) : <p className="px-3 py-2 text-[13px] text-muted">{products.data ? tr("Nothing seen on a tracked shelf by that name.", "추적 진열에서 찾을 수 없습니다.") : tr("Loading…", "불러오는 중…")}</p>}
        </div>
      )}
    </div>
  );
}
