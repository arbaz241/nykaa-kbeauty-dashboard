"use client";

import { useState } from "react";
import { CATEGORY_LABEL } from "@/lib/format";
import { QUAD, type CategoryCell } from "@/lib/analysis";

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const TONE = { accent: "var(--color-accent-strong)", good: "var(--color-good)", muted: "var(--color-muted)", bad: "var(--color-bad)" } as const;

/** Category opportunity map (replaces the BCG matrix, owner decision D2): across = the anchor's share of the
 *  category's recent reviews, with its usual share as the dividing line; up = category growth, with the market's
 *  growth as the dividing line. Each quadrant says what it means inside the chart. Thin categories are drawn
 *  hollow and never classified. */
export default function OpportunityMap({ cells, usual, market, anchor, onPick }: {
  cells: CategoryCell[]; usual: number; market: number | null; anchor: string; onPick: (c: CategoryCell) => void;
}) {
  const [hover, setHover] = useState<CategoryCell | null>(null);
  const W = 900; const H = 470; const L = 60; const R = 24; const T = 46; const B = 84;
  const placed = cells.filter((c) => c.growth !== null);
  const xMax = Math.max(usual * 2, ...placed.map((c) => c.anchorShare)) * 1.12 || 0.05;
  const gs = placed.map((c) => c.growth!); const gLo = Math.min(-0.2, ...gs, market ?? 0) - 0.05; const gHi = Math.max(0.3, ...gs, market ?? 0) + 0.05;
  // square-root scale: small shares spread out, one dominant category does not squash the rest
  const x = (v: number) => L + Math.sqrt(Math.max(0, v) / xMax) * (W - L - R);
  const y = (v: number) => T + (1 - (v - gLo) / (gHi - gLo)) * (H - T - B);
  const maxR = Math.max(...placed.map((c) => c.recent), 1);
  const r = (n: number) => 6 + Math.sqrt(n / maxR) * 16;
  const mx = market ?? 0;
  const xTicks = [0, usual / 4, usual, usual * 3, xMax * 0.9].filter((v) => v <= xMax).filter((v, i, a) => i === 0 || x(v) - x(a[i - 1]) > 40);
  const yTicks = [gLo + 0.05, 0, mx, gHi - 0.05].sort((a, b) => a - b).filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 0.06);

  // labels sit right of each bubble; nudge down any that would overlap one already placed
  const labelY = new Map<string, number>(); const taken: { x: number; y: number; w: number }[] = [];
  for (const c of [...placed].sort((a, b) => y(a.growth!) - y(b.growth!))) {
    const lx = x(c.anchorShare) + r(c.recent) + 4; const w = (CATEGORY_LABEL[c.category] ?? c.category).length * 6.2; let ly = y(c.growth!) + 4;
    while (taken.some((t) => Math.abs(t.y - ly) < 13 && lx < t.x + t.w && t.x < lx + w)) ly += 13;
    taken.push({ x: lx, y: ly, w }); labelY.set(c.category, ly);
  }
  const corner = (q: keyof typeof QUAD, cx: number, cy: number, anchorX: "start" | "end") => (
    <g>
      <text x={cx} y={cy} textAnchor={anchorX} fontSize={12} fontWeight={700} fill={TONE[QUAD[q].tone]}>{QUAD[q].label}</text>
      <text x={cx} y={cy + 14} textAnchor={anchorX} fontSize={10.5} fill="var(--color-muted)">
        {q === "opportunity" ? "growing fast, we're below our usual" : q === "invest" ? "growing fast, we're above our usual" : q === "maintain" ? "slower, we're above our usual" : "slower, we're below our usual"}
      </text>
    </g>
  );

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Category opportunity map">
        <rect x={L} y={T} width={x(usual) - L} height={y(mx) - T} fill="var(--color-accent-soft)" opacity={0.55} />
        {yTicks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-muted)">{signed(t)}</text></g>)}
        {xTicks.map((t) => <text key={t} x={x(t)} y={H - B + 18} textAnchor="middle" fontSize={11} fill="var(--color-muted)">{pct(t, 1)}</text>)}
        <line x1={x(usual)} x2={x(usual)} y1={T} y2={H - B} stroke="var(--color-ink-2)" strokeDasharray="4 4" />
        <text x={x(usual) + 6} y={H - B - 6} fontSize={10.5} fill="var(--color-ink-2)">{anchor}&apos;s usual share {pct(usual, 1)}</text>
        <line x1={L} x2={W - R} y1={y(mx)} y2={y(mx)} stroke="var(--color-ink-2)" strokeDasharray="4 4" />
        <text x={W - R} y={y(mx) - 6} textAnchor="end" fontSize={10.5} fill="var(--color-ink-2)">market growth {signed(mx)}</text>
        {corner("opportunity", L, 14, "start")}{corner("invest", W - R, 14, "end")}
        {corner("low", L, H - B + 36, "start")}{corner("maintain", W - R, H - B + 36, "end")}
        <text x={(L + W - R) / 2} y={H - B + 50} textAnchor="middle" fontSize={11.5} fill="var(--color-ink-2)">{anchor}&apos;s share of the category&apos;s reviews, Jul–Sep →</text>
        <text transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11.5} fill="var(--color-ink-2)">Category growth, Jul–Sep vs Apr–Jun →</text>
        {[...placed].sort((a, b) => b.recent - a.recent).map((c) => {
          const cx = x(c.anchorShare); const cy = y(c.growth!); const rr = r(c.recent); const ly = labelY.get(c.category) ?? cy - rr - 4; const flip = cx + rr + 4 + (CATEGORY_LABEL[c.category] ?? c.category).length * 6.2 > W - R;
          const col = c.quadrant ? TONE[QUAD[c.quadrant].tone] : "var(--color-faint)";
          return (
            <g key={c.category} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} onClick={() => onPick(c)} className="cursor-pointer">
              <circle cx={cx} cy={cy} r={rr} fill={c.thin ? "none" : col} fillOpacity={0.22} stroke={col} strokeWidth={1.5} strokeDasharray={c.thin ? "3 3" : undefined} />
              <text x={flip ? cx - rr - 4 : cx + rr + 4} y={ly} textAnchor={flip ? "end" : "start"} fontSize={11} fontWeight={600} fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth={3} paintOrder="stroke">{CATEGORY_LABEL[c.category] ?? c.category}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 w-[280px] -translate-x-1/2 rounded-xl bg-surface px-3.5 py-3 text-[12px] shadow-pop ring-1 ring-line">
          <div className="text-[13px] font-semibold">{CATEGORY_LABEL[hover.category]}{hover.quadrant ? ` · ${QUAD[hover.quadrant].label}` : " · thin data"}</div>
          <div className="mt-1.5 space-y-0.5 tabular text-ink-2">
            <div>Growth <b className="text-ink">{signed(hover.growth!)}</b>: {hover.growthBase.recent.toLocaleString("en-IN")} reviews vs {hover.growthBase.prior.toLocaleString("en-IN")} ({hover.growthBase.products} products)</div>
            <div>{anchor} <b className="text-ink">{pct(hover.anchorShare, 1)}</b>: {hover.anchorRecent} of {hover.recent.toLocaleString("en-IN")} reviews</div>
            <div>Leader {hover.leader.brand} {pct(hover.leader.share)}</div>
            {hover.thin && <div className="text-warn">Not classified: {hover.thin}</div>}
          </div>
          <div className="mt-1.5 text-[11px] text-muted">Click for the products</div>
        </div>
      )}
    </div>
  );
}
