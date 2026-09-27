"use client";

import { useMemo } from "react";
import { Card } from "./ui";
import { norm } from "@/lib/brands";
import { CATEGORY_LABEL } from "@/lib/format";
import type { Movement, Thumbnail } from "@/lib/types";

/** How a brand's product photography compares with the shelf it competes on.
 *  Nykaa ranks partly on clicks, and the thumbnail is what a shopper decides on — so a brand that
 *  shoots differently from its category is making a choice worth seeing stated. */
export default function Presentation({
  anchor, thumbs, movement,
}: { anchor: string; thumbs: Thumbnail[] | undefined; movement: Movement[] | undefined }) {
  const view = useMemo(() => {
    if (!thumbs?.length || !movement?.length) return null;

    const catOf = new Map<string, string>();
    for (const m of movement) if (!catOf.has(m.product_id)) catOf.set(m.product_id, m.category);
    const rankOf = new Map<string, number>();
    for (const m of movement) {
      const cur = rankOf.get(m.product_id);
      if (cur === undefined || m.rank < cur) rankOf.set(m.product_id, m.rank);
    }

    const mine = thumbs.filter((t) => norm(t.brand) === norm(anchor));
    if (!mine.length) return null;

    // Compare only against the categories the anchor actually sells in.
    const myCats = new Set(mine.map((t) => catOf.get(t.product_id)).filter(Boolean) as string[]);
    const rivals = thumbs.filter(
      (t) => norm(t.brand) !== norm(anchor) && myCats.has(catOf.get(t.product_id) ?? ""),
    );
    const winners = rivals.filter((t) => (rankOf.get(t.product_id) ?? 999) <= 20);

    const share = (rows: Thumbnail[], test: (t: Thumbnail) => boolean) =>
      rows.length ? rows.filter(test).length / rows.length : 0;

    const traits = [
      { label: "Plain pack shot", test: (t: Thumbnail) => t.shot_type === "pack_shot" },
      { label: "Shows a person", test: (t: Thumbnail) => !!t.model_present },
      { label: "Heavy text on image", test: (t: Thumbnail) => t.text_density === "heavy" },
      { label: "White background", test: (t: Thumbnail) => t.background === "white" },
    ].map((tr) => ({
      label: tr.label,
      mine: share(mine, tr.test),
      rivals: share(rivals, tr.test),
      winners: share(winners, tr.test),
    }));

    // A brand name printed on its own pack is not a claim, and neither is a pack size.
    const brandWords = new Set(thumbs.map((t) => norm(t.brand)));
    const claims = new Map<string, number>();
    for (const t of winners) for (const c of t.on_image_claims ?? []) {
      const k = c.trim().toLowerCase();
      if (k.length <= 4 || /^\d/.test(k) || brandWords.has(norm(k))) continue;
      if (/^\d+\s*(ml|g|gm|oz|fl)/i.test(k)) continue;
      claims.set(k, (claims.get(k) ?? 0) + 1);
    }
    const topClaims = [...claims.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return { mine, rivals, winners, traits, topClaims, cats: [...myCats] };
  }, [anchor, thumbs, movement]);

  if (!view) return null;
  const { mine, rivals, winners, traits, topClaims, cats } = view;

  return (
    <section className="mt-10">
      <h2 className="font-display text-[17px] font-semibold tracking-tight">How {anchor} shows up on the shelf</h2>
      <p className="mb-4 mt-1 max-w-[72ch] text-[13.5px] text-muted">
        Every main image read and described: what kind of shot it is, whether a person appears, how much text
        sits on it. {mine.length} {anchor} images against {rivals.length} rival images in{" "}
        {cats.map((c) => CATEGORY_LABEL[c] ?? c).slice(0, 4).join(", ")}
        {cats.length > 4 ? " and more" : ""} — and separately the {winners.length} rival images that are
        currently in a top 20.
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sunken text-[11.5px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-2.5 text-left font-semibold">Image treatment</th>
                <th className="px-5 py-2.5 text-right font-semibold">{anchor}</th>
                <th className="px-5 py-2.5 text-right font-semibold">All rivals</th>
                <th className="px-5 py-2.5 text-right font-semibold">Rivals in a top 20</th>
              </tr>
            </thead>
            <tbody>
              {traits.map((t) => {
                const gap = t.mine - t.winners;
                return (
                  <tr key={t.label} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">{t.label}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{Math.round(t.mine * 100)}%</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-2">{Math.round(t.rivals * 100)}%</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <span className={Math.abs(gap) >= 0.25 ? (gap < 0 ? "text-bad" : "text-good") : "text-ink-2"}>
                        {Math.round(t.winners * 100)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {topClaims.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] text-muted">
            What the rivals winning those shelves print on their images:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {topClaims.map(([claim, n]) => (
              <span key={claim} className="rounded-full bg-surface px-3 py-1 text-[12.5px] text-ink-2 ring-1 ring-line">
                {claim} <span className="text-muted">×{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-[12px] text-muted">
        A gap of 25 points or more against top-20 rivals is marked. It says these products are photographed
        differently, not that the photography caused the rank — the shelf order is Nykaa&rsquo;s, and it weighs
        far more than an image.
      </p>
    </section>
  );
}
