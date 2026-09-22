"use client";

import { compact, inr, pct, signed } from "@/lib/format";
import { ORIGIN_LABEL } from "@/lib/brands";
import type { BrandScore } from "@/lib/metrics";
import Sparkline from "./Sparkline";

type Row = {
  label: string; help: string; value: (s: BrandScore) => number | null; show: (s: BrandScore) => React.ReactNode;
  better?: "high" | "low"; bar?: boolean;
};
type Group = { title: string; rows: Row[] };

const GROUPS: Group[] = [
  { title: "Visibility", rows: [
    { label: "Top-100 listings", help: "Product slots in the top 100 of the 7 tracked categories", value: (s) => s.slots, show: (s) => <><b>{s.slots}</b><Sub>{s.categories.length} categories</Sub></>, better: "high", bar: true },
    { label: "In the top 20", help: "Slots in the first 20 positions, where most clicks happen", value: (s) => s.top20, show: (s) => <b>{s.top20}</b>, better: "high", bar: true },
    { label: "Best rank", help: "Highest position of any product", value: (s) => s.bestRank, show: (s) => <><b>{s.bestRank ? `#${s.bestRank}` : "–"}</b><Sub>typical #{s.medianRank ? Math.round(s.medianRank) : "–"}</Sub></>, better: "low" },
  ]},
  { title: "Price & promotion", rows: [
    { label: "Typical price", help: "Median selling price of its listed products", value: (s) => s.medianPrice, show: (s) => <><b>{inr(s.medianPrice)}</b><Sub>{inr(s.minPrice)}–{inr(s.maxPrice)}</Sub></> },
    { label: "Discount", help: "Average % off MRP", value: (s) => s.avgDiscount, show: (s) => <b>{s.avgDiscount === null ? "–" : `${Math.round(s.avgDiscount)}%`}</b>, bar: true },
    { label: "With an offer", help: "Share of listings carrying a gift, bundle or coupon offer", value: (s) => s.offerShare, show: (s) => <b>{pct(s.offerShare)}</b>, bar: true },
    { label: "Paid placement", help: "Share of its listings that are AD or featured slots", value: (s) => s.paidShare, show: (s) => <b>{pct(s.paidShare)}</b>, bar: true },
  ]},
  { title: "Reception", rows: [
    { label: "Rating", help: "Average star rating of its listed products", value: (s) => s.rating, show: (s) => <b>{s.rating ? `★ ${s.rating.toFixed(2)}` : "–"}</b>, better: "high" },
    { label: "Ratings", help: "Total star ratings on its listed products", value: (s) => s.ratings, show: (s) => <b>{compact(s.ratings)}</b>, better: "high", bar: true },
  ]},
  { title: "Momentum", rows: [
    { label: "Reviews, last 3 months", help: "Dated reviews on its leading products in the last 3 complete months: a proxy for recent sales", value: (s) => s.last3, show: (s) => s.last3 === null ? <Sub>not tracked</Sub> : <><b>{compact(s.last3)}</b><Sub>{s.demandProducts} product{s.demandProducts === 1 ? "" : "s"}</Sub></>, better: "high", bar: true },
    { label: "vs prior 3 months", help: "Change in review volume against the 3 months before: rising means more recent demand", value: (s) => s.growth, show: (s) => <Delta v={s.growth} />, better: "high" },
    { label: "12-month trend", help: "Monthly reviews over the last 12 complete months", value: () => null, show: () => null },
  ]},
  { title: "Search & range", rows: [
    { label: "K-beauty searches", help: "Tracked Korean-intent searches where it appears in the top 10 unpaid results", value: (s) => s.searchTerms, show: (s) => <><b>{s.searchTerms}</b><Sub>{s.bestSearch ? `best #${s.bestSearch}` : "absent"}</Sub></>, better: "high", bar: true },
    { label: "Range on Nykaa", help: "All products the brand lists on Nykaa", value: (s) => s.range, show: (s) => <><b>{s.range ?? "–"}</b><Sub>{s.conversion !== null ? `${pct(s.conversion)} reach the top 100` : ""}</Sub></> },
  ]},
];

function Sub({ children }: { children: React.ReactNode }) { return <span className="ml-2 text-[12px] font-normal text-muted">{children}</span>; }
function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[12px] text-muted">–</span>;
  return <b className={v > 0.02 ? "text-good" : v < -0.02 ? "text-bad" : "text-ink-2"}>{v > 0 ? "▲" : v < 0 ? "▼" : ""} {signed(v).replace(/^[+-]/, "")}</b>;
}

export default function Scorecard({ scores, colors }: { scores: BrandScore[]; colors: Record<string, string> }) {
  const cols = `200px repeat(${scores.length}, minmax(0, 1fr))`;
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div className="min-w-[760px]">
        <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
          <div />
          {scores.map((s) => (
            <div key={s.brand} className="px-5 py-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[s.brand] }} /><span className="font-display text-[16px] font-semibold tracking-tight">{s.brand}</span></div>
              <div className="mt-1 text-[12px] text-muted">{ORIGIN_LABEL[s.origin]}{s.madeIn ? ` · Made in ${s.madeIn}` : ""}{s.kMarketing ? " · sells as Korean" : ""}</div>
            </div>
          ))}
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="border-b border-line last:border-0">
            <div className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</div>
            {g.rows.map((r) => {
              const vals = scores.map(r.value); const present = vals.filter((v): v is number => v !== null);
              const max = present.length ? Math.max(...present.map(Math.abs)) : 0;
              const best = r.better && present.length > 1 ? (r.better === "high" ? Math.max(...present) : Math.min(...present)) : null;
              return (
                <div key={r.label} className="grid items-center hover:bg-page/60" style={{ gridTemplateColumns: cols }}>
                  <div className="px-5 py-3" title={r.help}>
                    <div className="text-[13px] text-ink-2">{r.label}</div>
                  </div>
                  {scores.map((s, i) => {
                    const v = vals[i]; const isBest = best !== null && v === best;
                    return (
                      <div key={s.brand} className="px-5 py-3 text-[14px] tabular">
                        {r.label === "12-month trend" ? <Sparkline values={s.spark} color={colors[s.brand]} /> : (
                          <div className="flex items-baseline">
                            {r.show(s)}
                            {isBest && <span className="ml-2 rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white">lead</span>}
                          </div>
                        )}
                        {r.bar && v !== null && max > 0 && (
                          <div className="mt-2 h-1 w-full max-w-[180px] rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${(Math.abs(v) / max) * 100}%`, background: colors[s.brand] }} /></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
