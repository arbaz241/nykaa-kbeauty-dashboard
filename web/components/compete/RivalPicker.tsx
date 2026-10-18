"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { norm } from "@/lib/brands";
import { inr, shortName } from "@/lib/format";
import type { FlowRow } from "@/lib/market";
import type { CatalogRow, ShelfRow } from "@/lib/types";
import { tr } from "@/lib/i18n";

/** Round 4 (owner 17 Oct 2026: "we can take out and put more rivals if we want"). Anyone can drop a rival or add any
 *  product in the category; the choice is kept in this browser only, so trying a rival changes nobody else's view.
 *  Suggestions: the category's shelf leaders, and challengers that climbed over the chosen period. */

export interface RivalEdit { removed: string[]; added: { pid: string; brand: string }[] }
const KEY = "nmi.rivals";
export function loadEdits(): Record<string, RivalEdit> {
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, RivalEdit>; } catch { return {}; }
}
export function saveEdits(e: Record<string, RivalEdit>) {
  try { window.localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* storage unavailable: the choice lasts this visit */ }
}
export const MAX_PRODUCTS = 7;

interface Option { pid: string; brand: string; name: string; price: number | null; rank: number | null; note?: string }

export default function RivalPicker({ cat, anchorBrand, current, edited, rows, catalog, flow, onRemove, onAdd, onReset }: {
  cat: string; anchorBrand: string; current: { pid: string; brand: string; role: string; name: string }[]; edited: boolean;
  rows: ShelfRow[]; catalog: CatalogRow[]; flow: FlowRow[];
  onRemove: (pid: string) => void; onAdd: (pid: string, brand: string) => void; onReset: () => void;
}) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const inView = new Set(current.map((c) => c.pid));
  const full = current.length >= MAX_PRODUCTS;
  const pool: Option[] = useMemo(() => {
    const on = rows.filter((r) => r.subcategory === cat).sort((a, b) => a.rank - b.rank).map((r) => ({ pid: r.product_id, brand: r.brand, name: r.name, price: r.price, rank: r.rank }));
    const seen = new Set(on.map((o) => o.pid));
    const more = catalog.filter((r) => r.subcategories.includes(cat) && !seen.has(r.product_id)).map((r) => ({ pid: r.product_id, brand: r.brand, name: r.name, price: r.price, rank: null }));
    return [...on, ...more];
  }, [rows, catalog, cat]);
  const leaders = pool.filter((o) => o.rank !== null && norm(o.brand) !== norm(anchorBrand) && !inView.has(o.pid)).slice(0, 6);
  const climbers = flow.filter((r) => r.subcategory === cat && r.rankEnd !== null && norm(r.brand) !== norm(anchorBrand) && !inView.has(r.product_id))
    .map((r) => ({ r, gain: r.rankStart === null ? 101 - (r.rankEnd ?? 101) : r.rankStart - (r.rankEnd ?? 0) })).filter((x) => x.gain >= 5).sort((a, b) => b.gain - a.gain).slice(0, 6)
    .map(({ r, gain }) => ({ pid: r.product_id, brand: r.brand, name: r.name, price: r.price, rank: r.rankEnd, note: r.rankStart === null ? tr("new in the top 100", "상위 100위 신규") : tr(`up ${gain} places`, `${gain}계단 상승`) }));
  const found = q.trim() ? pool.filter((o) => !inView.has(o.pid) && `${o.brand} ${o.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 10) : [];

  const opt = (o: Option) => (
    <button key={o.pid} disabled={full} onClick={() => { onAdd(o.pid, o.brand); setQ(""); }}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-sunken disabled:opacity-40">
      <span className="min-w-0 truncate"><b className="font-medium">{o.brand}</b> {shortName(o.name, o.brand)}</span>
      <span className="shrink-0 tabular text-muted">{o.note ? <span className="mr-2 text-good">{o.note}</span> : null}{o.rank ? `#${o.rank}` : tr("range", "라인업")} · {inr(o.price)}</span>
    </button>
  );

  return (
    <Card className="mt-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Rivals in view", "비교 중인 경쟁 제품")}</span>
        {current.map((c) => (
          <span key={c.pid} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[12.5px] ring-1 ${c.role === "anchor" ? "bg-brand text-on-brand ring-brand" : c.role === "added" ? "bg-[#fbeee4] text-ink ring-[#f0c9a8]" : "bg-surface text-ink-2 ring-line"}`}>
            <span className="max-w-[220px] truncate">{c.brand} · {shortName(c.name, c.brand)}</span>
            {c.role !== "anchor" && <button aria-label={tr(`Remove ${c.brand}`, `${c.brand} 빼기`)} onClick={() => onRemove(c.pid)} className="grid h-5 w-5 place-items-center rounded-full text-[13px] leading-none hover:bg-sunken">×</button>}
          </span>
        ))}
        <button onClick={() => setOpen(!open)} disabled={full} className="rounded-full px-3 py-1 text-[12.5px] font-medium text-accent-strong ring-1 ring-line hover:bg-sunken disabled:opacity-40">{full ? tr(`${MAX_PRODUCTS} products at most`, `최대 ${MAX_PRODUCTS}개`) : open ? tr("Close", "닫기") : tr("+ Add a rival", "+ 경쟁 제품 추가")}</button>
        {edited && <button onClick={onReset} className="text-[12px] text-ink-2 underline decoration-line-2 underline-offset-2">{tr("Back to the analysed set", "분석된 구성으로 되돌리기")}</button>}
      </div>
      {open && !full && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-3">
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Find any product in this category", "이 카테고리 제품 찾기")}
              className="w-full rounded-xl border border-line bg-page px-3 py-1.5 text-[12.5px] outline-none focus:border-accent-strong" />
            <div className="mt-1.5 max-h-[260px] overflow-y-auto">{q ? (found.length ? found.map(opt) : <p className="px-2 py-2 text-[12px] text-muted">{tr("No match on the shelf or in the tracked ranges.", "진열·추적 라인업에 일치하는 제품 없음.")}</p>) : <p className="px-2 py-2 text-[12px] text-muted">{tr("Today's top 100 and the tracked brands' ranges.", "오늘의 상위 100위와 추적 브랜드 라인업.")}</p>}</div>
          </div>
          <div><div className="px-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Shelf leaders here", "이 카테고리 진열 상위")}</div>{leaders.map(opt)}</div>
          <div><div className="px-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Rising challengers (chosen period)", "상승 중인 도전자 (선택 기간)")}</div>{climbers.length ? climbers.map(opt) : <p className="px-2 py-1.5 text-[12px] text-muted">{tr("None climbed 5+ places in the period.", "기간 중 5계단 이상 오른 제품 없음.")}</p>}</div>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-muted">{tr("Your changes are kept in this browser only. Added products get every number below; the AI-written message comparison covers the analysed set only.", "변경 사항은 이 브라우저에만 저장. 추가한 제품도 아래 모든 수치가 나오지만, AI 메시지 비교는 분석된 구성만 해당.")}</p>
    </Card>
  );
}
