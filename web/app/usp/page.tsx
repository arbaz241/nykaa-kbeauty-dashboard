"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead, SectionHead } from "@/components/ui";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import { useCatalog, useShelf } from "@/lib/data";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { ROLE_LABEL, VERDICT, useUspComparisons, useUspProducts, type UspComparison, type UspProduct } from "@/lib/usp";

// the anchor products' shelves, in the order the owner reads them (scraper/rivals.py ANCHOR_PRODUCTS)
const CATEGORY_ORDER = ["toner", "face_moisturizer", "serum", "sunscreen", "face_wash", "masks", "eye_care", "lip_balm"];
const CAT_LABEL: Record<string, string> = { ...CATEGORY_LABEL, lip_balm: "Lip balm" };
const PROOF = { strong: "text-good", moderate: "text-ink-2", weak: "text-bad" } as const;

export default function UspPage() {
  return (
    <AuthGate>
      <Usp />
    </AuthGate>
  );
}

function Usp() {
  const shelf = useShelf();
  const catalog = useCatalog();
  const products = useUspProducts();
  const comparisons = useUspComparisons();
  const groups = useMemo(
    () => [...(comparisons.data ?? [])].sort((a, b) => CATEGORY_ORDER.indexOf(a.category ?? "") - CATEGORY_ORDER.indexOf(b.category ?? "")),
    [comparisons.data],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const current = groups.find((g) => g.anchor_product_id === picked) ?? groups[0];
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.product_id, p])), [products.data]);

  // price, rating and image for the drawer: today's shelf first, else the brand catalogue
  const facts = useMemo(() => {
    const m = new Map<string, Partial<ProductRef>>();
    for (const r of catalog.data ?? []) m.set(r.product_id, { price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, image: r.best_image, url: r.url });
    for (const r of shelf.data ?? []) m.set(r.product_id, { price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, image: r.image_url, url: r.url });
    return m;
  }, [shelf.data, catalog.data]);

  return (
    <Shell active="USP" asOf={shelf.data?.[0]?.scrape_date}>
      <PageHead
        title="What each product sells itself on"
        sub="Read from every photo in the product's Nykaa gallery, its page text and its reviews, then set against its direct rivals: three K-beauty products doing the same job at a similar price, the Indian market leader, and a global brand."
      />
      {comparisons.isLoading || products.isLoading ? (
        <Loading what="the USP analysis" />
      ) : !groups.length ? (
        <Card className="mt-8 px-5 py-8 text-center">
          <p className="text-[14px] font-medium">No analysis yet</p>
          <p className="mt-1 text-[13px] text-muted">The first run fills this page.</p>
        </Card>
      ) : (
        <>
          <Picker groups={groups} current={current} onPick={setPicked} />
          {current && <Comparison g={current} byId={byId} facts={facts} />}
        </>
      )}
    </Shell>
  );
}

function Picker({ groups, current, onPick }: { groups: UspComparison[]; current?: UspComparison; onPick: (id: string) => void }) {
  const byCat = new Map<string, UspComparison[]>();
  for (const g of groups) byCat.set(g.category ?? "", [...(byCat.get(g.category ?? "") ?? []), g]);
  return (
    <div className="mt-7 grid gap-2.5">
      {[...byCat.entries()].map(([cat, gs]) => (
        <div key={cat} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 shrink-0 text-[12px] uppercase tracking-[0.08em] text-muted">{CAT_LABEL[cat] ?? cat}</span>
          {gs.map((g) => (
            <button key={g.anchor_product_id} onClick={() => onPick(g.anchor_product_id)}
              className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === current ? "bg-ink text-page ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
              {shortName(g.anchor_name, "Innisfree").split(/,| [-–|] | SPF | For /)[0]}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function Comparison({ g, byId, facts }: { g: UspComparison; byId: Map<string, UspProduct>; facts: Map<string, Partial<ProductRef>> }) {
  const openProduct = useOpenProduct();
  const c = g.comparison;
  const anchor = byId.get(g.anchor_product_id);
  const members = g.products.map((id) => byId.get(id)).filter(Boolean) as UspProduct[];
  const open = (p: UspProduct) => openProduct({ product_id: p.product_id, name: p.name, brand: p.brand, url: p.url, ...facts.get(p.product_id) });
  const ap = c.anchor_position;

  return (
    <div className="mt-8">
      <Card className="px-6 py-5">
        <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Verdict for Innisfree</div>
        <p className="mt-1.5 max-w-[95ch] font-display text-[18px] font-medium leading-snug tracking-tight">{ap.verdict}</p>
        <p className="mt-3 max-w-[110ch] text-[13.5px] leading-relaxed text-ink-2">{c.group_summary}</p>
        {anchor && (
          <p className="mt-3 text-[13px] text-ink-2">
            <span className="text-muted">Innisfree&rsquo;s buyers vs rivals&rsquo; buyers: </span>{ap.review_resonance_vs_rivals}
          </p>
        )}
      </Card>

      <div className="mt-9" />
      <SectionHead title="Side by side" note="Each listing's main promise, its proof, and whether buyers say it back. Open a product for its shelf and review history." />
      <div className="-mx-6 overflow-x-auto px-6 pb-2">
        <div className="grid min-w-[1100px] gap-3" style={{ gridTemplateColumns: `repeat(${members.length}, minmax(0, 1fr))` }}>
          {members.map((p) => {
            const a = p.analysis;
            const role = g.roles?.[p.product_id] ?? "anchor";
            const f = facts.get(p.product_id);
            const v = VERDICT[a.review_check.usp_verdict];
            const angle = c.products.find((x) => x.product.toLowerCase().includes(p.name.toLowerCase().slice(0, 24)));
            return (
              <Card key={p.product_id} className={`flex flex-col px-4 py-4 ${role === "anchor" ? "ring-2 ring-ink" : ""}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{ROLE_LABEL[role] ?? role}</div>
                <button onClick={() => open(p)} className="mt-1 text-left">
                  <div className="text-[12px] font-semibold text-ink-2">{p.brand}</div>
                  <div className="text-[13.5px] font-medium leading-snug hover:underline">{shortName(p.name, p.brand).slice(0, 70)}</div>
                </button>
                <div className="mt-1 text-[12px] text-muted tabular">{inr(f?.price)}{f?.rating ? ` · ★ ${Number(f.rating).toFixed(1)} · ${compact(f.rating_count)}` : ""}</div>

                <Label>Main promise</Label>
                <p className="text-[13px] leading-snug">{a.main_usp.statement}</p>
                {a.main_usp.brand_words && <p className="mt-1 text-[12px] italic text-muted">&ldquo;{a.main_usp.brand_words}&rdquo;</p>}

                <Label>Key benefits</Label>
                <ul className="space-y-1">
                  {[...a.key_benefits].sort((x, y) => y.emphasis - x.emphasis).slice(0, 4).map((b) => (
                    <li key={b.benefit} className="text-[12.5px] leading-snug">
                      {b.benefit}
                      {b.proof_type !== "none" && b.proof_type !== "ingredient_logic_only" && <span className="text-muted"> · {b.proof_type.replaceAll("_", " ")}</span>}
                    </li>
                  ))}
                </ul>

                {!!a.hero_ingredients.length && (<>
                  <Label>Hero ingredients</Label>
                  <div className="flex flex-wrap gap-1">{a.hero_ingredients.slice(0, 5).map((h) => <span key={h.ingredient} title={h.claimed_role} className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] text-ink-2">{h.ingredient}</span>)}</div>
                </>)}

                <div className="mt-auto pt-4">
                  <div className="text-[12px]"><span className="text-muted">Proof </span><span className={`font-medium ${PROOF[a.proof_strength.rating]}`}>{a.proof_strength.rating}</span></div>
                  <div className={`text-[12px] font-medium ${v.tone}`}>{v.label}</div>
                  {angle && <p className="mt-2 border-t border-line pt-2 text-[12px] leading-snug text-ink-2"><span className="text-muted">Distinct angle: </span>{angle.distinct_angle}</p>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ListCard title="Where Innisfree is stronger" tone="good" items={ap.stronger_than_rivals.map((x) => ({ head: x.rival, body: x.where }))} empty="No rival it clearly out-argues." />
        <ListCard title="Where Innisfree is weaker" tone="bad" items={ap.weaker_than_rivals.map((x) => ({ head: x.rival, body: x.where }))} empty="No rival clearly out-argues it." />
        <ListCard title="Only Innisfree says" items={ap.unique_to_anchor.map((x) => ({ body: x }))} empty="Nothing Innisfree claims is unique in this group." />
        <ListCard title="Messages it shares with rivals" items={ap.overlaps_with.map((x) => ({ head: x.rival, body: x.shared_message }))} empty="No overlap." />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ListCard title="Table stakes: claims everyone makes" note="These don't set anyone apart."
          items={c.table_stakes.map((t) => ({ body: t.claim, foot: t.products_making_it.join(" · ") }))} empty="None." />
        <ListCard title="White space" note="What buyers in this group value that no listing claims clearly." tone="good"
          items={c.white_space.map((w) => ({ head: w.opportunity, body: w.evidence }))} empty="None found." />
      </div>

      {anchor && <BuyerEcho p={anchor} />}

      <p className="mt-6 text-[12px] text-muted">
        Analysed {new Date(g.analysed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Re-read only when a product&rsquo;s photos change.
      </p>
    </div>
  );
}

function BuyerEcho({ p }: { p: UspProduct }) {
  const r = p.analysis.review_check;
  return (
    <>
      <div className="mt-9" />
      <SectionHead title="Do Innisfree's buyers say it back?" note={`From ${r.reviews_considered} reviews of ${shortName(p.name, p.brand).split(/ [-–|,]/)[0]}, most-liked and most-recent.`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Each claim, checked" items={r.benefit_verdicts.map((b) => ({ head: b.benefit, tag: VERDICT[b.verdict], body: b.explanation, quote: b.quotes[0] }))} empty="—" />
        <ListCard title="Valued but not advertised" tone="good" items={r.valued_but_not_advertised.map((x) => ({ head: x.theme, body: x.how_often, quote: x.quotes[0] }))} empty="Nothing beyond what the listing says." />
        <ListCard title="Recurring complaints" tone="bad" items={r.recurring_complaints.map((x) => ({ head: x.theme, body: x.how_often, quote: x.quotes[0] }))} empty="No recurring complaint." />
      </div>
    </>
  );
}

type Item = { head?: string; body: string; foot?: string; quote?: string; tag?: { label: string; tone: string } };
function ListCard({ title, note, items, empty, tone }: { title: string; note?: string; items: Item[]; empty: string; tone?: "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <div className={`text-[14px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{title}</div>
      {note && <div className="text-[12px] text-muted">{note}</div>}
      {items.length ? (
        <ul className="mt-2.5 space-y-2.5">
          {items.map((i, n) => (
            <li key={n} className="text-[13px] leading-snug">
              {i.head && <span className="font-medium">{i.head}</span>}
              {i.tag && <span className={`ml-1.5 text-[11.5px] ${i.tag.tone}`}>{i.tag.label}</span>}
              <span className="block text-ink-2">{i.body}</span>
              {i.quote && <span className="mt-0.5 block text-[12px] italic text-muted">&ldquo;{i.quote}&rdquo;</span>}
              {i.foot && <span className="mt-0.5 block text-[11.5px] text-muted">{i.foot}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[13px] text-muted">{empty}</p>}
    </Card>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-1 mt-3.5 text-[11px] uppercase tracking-[0.08em] text-muted">{children}</div>;
