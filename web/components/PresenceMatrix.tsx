"use client";

import { norm } from "@/lib/brands";
import { CATEGORIES, CATEGORY_LABEL, compact, inr } from "@/lib/format";
import type { CatalogRow, ShelfRow } from "@/lib/types";

/** Categories × brands. A dash used to mean three different things; each cell now says which:
 *  in the top 100 (how many, best rank, typical price), sold but outside the top 100 (how many, its biggest
 *  seller's ratings), or not sold at all. The last two come from each brand's full Nykaa catalogue. */
export default function PresenceMatrix({ shelf, catalog, brands, colors, anchor, onPick, categories = CATEGORIES }: {
  shelf: ShelfRow[]; catalog: CatalogRow[] | undefined; brands: string[]; colors: Record<string, string>; anchor: string; onPick: (cat: string) => void;
  /** rows to show; defaults to every tracked category */
  categories?: string[];
}) {
  const cols = `190px repeat(${brands.length}, minmax(0, 1fr))`;
  const withCatalog = new Set((catalog ?? []).map((r) => r.brand));
  const maxN = Math.max(1, ...categories.flatMap((c) => brands.map((b) => shelf.filter((r) => r.subcategory === c && r.brand === b).length)));
  const range = (c: string, b: string) => (catalog ?? []).filter((r) => r.brand === b && r.subcategories.includes(c));
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line px-5 py-2.5 text-[11.5px] text-muted">
        <span><b className="text-ink">3</b> best #12 = listings in the category&apos;s top 100 today</span>
        <span><span className="text-[#8a6100]">Sells 8, none in top 100</span> = in its range, not ranking</span>
        <span><i>Not sold</i> = the brand sells nothing here on Nykaa</span>
        <span><i>Crawl pending</i> = not in today&rsquo;s top 100, and the brand&rsquo;s full range is collected from 12 Oct</span>
      </div>
      <div className="min-w-[760px]">
        {categories.map((c) => {
          const anchorSells = shelf.some((r) => r.subcategory === c && norm(r.brand) === norm(anchor)) || range(c, brands.find((b) => norm(b) === norm(anchor)) ?? "").length > 0;
          const othersRank = brands.some((b) => norm(b) !== norm(anchor) && shelf.some((r) => r.subcategory === c && r.brand === b));
          const gap = brands.some((b) => norm(b) === norm(anchor)) && withCatalog.has(brands.find((b) => norm(b) === norm(anchor))!) && !anchorSells && othersRank;
          return (
            <button key={c} onClick={() => onPick(c)} className="grid w-full items-stretch border-b border-line text-left last:border-0 hover:bg-page/60" style={{ gridTemplateColumns: cols }}>
              <div className="px-5 py-3">
                <div className="flex items-center justify-between text-[13.5px] font-medium">{CATEGORY_LABEL[c]}<span className="text-[11.5px] font-normal text-muted">compare →</span></div>
                {gap && <span className="mt-1 inline-block rounded bg-[#fdeee6] px-1.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#b4501f]">{anchor} gap</span>}
              </div>
              {brands.map((b) => {
                const g = shelf.filter((r) => r.subcategory === c && r.brand === b);
                const rg = range(c, b);
                if (g.length) {
                  const best = Math.min(...g.map((r) => r.rank)); const prices = g.map((r) => r.price ?? 0).sort((x, y) => x - y);
                  return (
                    <div key={b} className="px-5 py-2.5">
                      <div className="flex items-baseline gap-2 text-[13.5px] tabular"><b>{g.length}</b><span className="text-[12px] text-muted">best #{best} · {inr(prices[Math.floor(prices.length / 2)])}</span></div>
                      <div className="mt-1.5 h-1 rounded-full bg-sunken"><div className="h-1 rounded-full" style={{ width: `${(g.length / maxN) * 100}%`, background: colors[b] }} /></div>
                      {rg.length > g.length && <div className="mt-1 text-[11px] text-muted">of {rg.length} it sells here</div>}
                    </div>
                  );
                }
                if (!withCatalog.has(b)) return <div key={b} className="px-5 py-3 text-[11.5px] italic text-muted">Crawl pending</div>;
                if (!rg.length) return <div key={b} className="px-5 py-3 text-[11.5px] italic text-muted">Not sold</div>;
                const top = [...rg].sort((x, y) => (y.rating_count ?? 0) - (x.rating_count ?? 0))[0];
                return (
                  <div key={b} className="px-5 py-2.5">
                    <div className="text-[12.5px] text-[#8a6100]">Sells {rg.length}, none in top 100</div>
                    <div className="mt-0.5 text-[11px] text-muted">top seller {compact(top.rating_count)} ratings · {inr(top.price)}</div>
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
