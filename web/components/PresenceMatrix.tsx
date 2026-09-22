"use client";

import { CATEGORIES, CATEGORY_LABEL, inr } from "@/lib/format";
import type { ShelfRow } from "@/lib/types";

/** Categories × brands: listings, best rank and typical price. Click a cell to compare that category's products. */
export default function PresenceMatrix({ shelf, brands, colors, onPick }: { shelf: ShelfRow[]; brands: string[]; colors: Record<string, string>; onPick: (cat: string) => void }) {
  const cols = `200px repeat(${brands.length}, minmax(0, 1fr))`;
  const maxN = Math.max(1, ...CATEGORIES.flatMap((c) => brands.map((b) => shelf.filter((r) => r.subcategory === c && r.brand === b).length)));
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div className="min-w-[760px]">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => onPick(c)} className="grid w-full items-stretch border-b border-line text-left last:border-0 hover:bg-page/60" style={{ gridTemplateColumns: cols }}>
            <div className="flex items-center justify-between px-5 py-3 text-[13.5px] font-medium">{CATEGORY_LABEL[c]}<span className="text-[11.5px] font-normal text-muted">compare →</span></div>
            {brands.map((b) => {
              const g = shelf.filter((r) => r.subcategory === c && r.brand === b);
              if (!g.length) return <div key={b} className="px-5 py-3 text-[12.5px] text-muted">—</div>;
              const best = Math.min(...g.map((r) => r.rank)); const prices = g.map((r) => r.price ?? 0).sort((x, y) => x - y);
              return (
                <div key={b} className="px-5 py-2.5">
                  <div className="flex items-baseline gap-2 text-[13.5px] tabular"><b>{g.length}</b><span className="text-[12px] text-muted">best #{best} · {inr(prices[Math.floor(prices.length / 2)])}</span></div>
                  <div className="mt-1.5 h-1 rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${(g.length / maxN) * 100}%`, background: colors[b] }} /></div>
                </div>
              );
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
