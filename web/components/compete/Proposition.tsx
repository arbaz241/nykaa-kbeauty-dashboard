"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { ActionSection, More, ShowAll } from "@/components/Report";
import { Card } from "@/components/ui";
import { ROLE_LABEL, matchRival, shortTitle, type ProductFacts } from "@/lib/competeData";
import { compact, inr } from "@/lib/format";
import { VERDICT, type UspComparison } from "@/lib/usp";
import { ProductHead } from "./Overview";

const PROOF_TONE = { strong: "good", moderate: undefined, weak: "bad" } as const;
const Sub = ({ children }: { children: React.ReactNode }) => <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{children}</div>;
const Text = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] leading-snug">{children}</p>;

/* ---------------------------------------------------------------- §3 proposition */

/** What each product sells itself on: the USP read (gallery, page, reviews) and Nykaa's own page text,
 *  aligned topic by topic so the same row can be read across products. */
export function Proposition({ hero, products, colors }: { hero: UspComparison | null; products: ProductFacts[]; colors: Record<string, string> }) {
  const a = products.find((p) => p.role === "anchor");
  const c = hero?.comparison;
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const has = (p: ProductFacts) => !!p.usp;
  const rows: ExtraRow<ProductFacts>[] = [
    { label: "Main promise", help: "The single message the listing leads on, read from its whole gallery and page", has,
      render: (p) => <div><Text>{p.usp!.analysis.main_usp.statement}</Text>{p.usp!.analysis.main_usp.brand_words && <Sub><i>&ldquo;{p.usp!.analysis.main_usp.brand_words}&rdquo;</i></Sub>}<Sub>confidence {p.usp!.analysis.main_usp.confidence}</Sub></div> },
    { label: "Key benefits", help: "Benefits it claims, most emphasised first, with the kind of proof offered", has,
      render: (p) => <ul className="space-y-1.5"><ShowAll n={4} items={[...p.usp!.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)} render={(b) => (
        <li key={b.benefit} className="text-[12.5px] leading-snug">{b.benefit}{b.proof_type !== "none" && <Sub><b className="font-medium">{b.proof_type.replaceAll("_", " ")}</b>{b.proof_detail ? <>: <More text={b.proof_detail} /></> : null}</Sub>}</li>)} /></ul> },
    { label: "Hero ingredients", has: (p) => !!p.usp?.analysis.hero_ingredients.length,
      render: (p) => <ul className="space-y-1"><ShowAll n={3} items={p.usp!.analysis.hero_ingredients} render={(h) => <li key={h.ingredient} className="text-[12.5px] leading-snug"><b className="font-medium">{h.ingredient}</b><Sub>{h.claimed_role}</Sub></li>} /></ul> },
    { label: "Proof strength", help: "How well the listing proves its promise (clinical numbers, before/after, certifications…)", has,
      render: (p) => <div><Chip tone={PROOF_TONE[p.usp!.analysis.proof_strength.rating]}>{p.usp!.analysis.proof_strength.rating}</Chip><Sub><More text={p.usp!.analysis.proof_strength.reason} /></Sub></div> },
    { label: "Do buyers say it back?", help: "Whether reviewers repeat the main promise", has,
      render: (p) => { const r = p.usp!.analysis.review_check; const v = VERDICT[r.usp_verdict];
        return <div><span className={`text-[12.5px] font-medium ${v.tone}`}>{v.label}</span><Sub><More text={r.usp_explanation} /></Sub>{r.usp_quotes[0] && <Sub><i>&ldquo;{r.usp_quotes[0]}&rdquo;</i></Sub>}</div>; } },
    { label: "Distinct angle in this group", help: "What sets it apart from the other products compared here", has: (p) => !!p.groupRead,
      render: (p) => <div><Text>{p.groupRead!.distinct_angle}</Text><Sub>credibility <b>{p.groupRead!.credibility}</b>: <More text={p.groupRead!.credibility_reason} /></Sub><Sub>buyers: <More text={p.groupRead!.buyers_echo_it} /></Sub></div> },
    { label: "Who it's for", has, render: (p) => <div><Text>{p.usp!.analysis.target_consumer.summary}</Text>
      <div className="mt-1 flex flex-wrap gap-1">{p.usp!.analysis.target_consumer.attributes.slice(0, 5).map((t) => <Chip key={t.dimension + t.value} title={t.evidence}>{t.value}{t.basis === "implied" ? " (implied)" : ""}</Chip>)}</div></div> },
    { label: "Trust & safety claims", has: (p) => !!p.usp?.analysis.trust_and_safety_claims.length,
      render: (p) => <div className="flex flex-wrap gap-1">{p.usp!.analysis.trust_and_safety_claims.map((t) => <Chip key={t} tone="plain">{t}</Chip>)}</div> },
    { label: "Brand & emotional angle", has: (p) => !!p.usp?.analysis.emotional_and_brand_angle, render: (p) => <Text>{p.usp!.analysis.emotional_and_brand_angle}</Text> },
    // Nykaa's own page text (old Compare rows)
    { label: "What it is (Nykaa page)", has: (p) => !!p.whatItIs, render: (p) => <Text>{p.whatItIs}</Text> },
    { label: "Claims (Nykaa page)", has: (p) => p.claims.length > 0, render: (p) => <ul className="list-disc space-y-0.5 pl-4 text-[12px] leading-snug text-ink-2"><ShowAll n={4} items={p.claims} render={(x) => <li key={x}>{x}</li>} /></ul> },
    { label: "Targets", has: (p) => p.concerns.length > 0, render: (p) => <div className="flex flex-wrap gap-1">{p.concerns.map((x) => <Chip key={x}>{x}</Chip>)}</div> },
    { label: "Key ingredients (Nykaa)", has: (p) => p.ingredients.length > 0, render: (p) => <div className="flex flex-wrap gap-1">{p.ingredients.slice(0, 8).map((x) => <Chip key={x}>{x}</Chip>)}</div> },
    { label: "Details", has: (p) => !!(p.formulation || p.madeIn || p.skinTypes.length || p.since),
      render: (p) => <div className="space-y-0.5 text-[12px] text-ink-2">{(p.formulation || p.madeIn) && <div>{[p.formulation, p.madeIn ? `Made in ${p.madeIn}` : null].filter(Boolean).join(" · ")}</div>}
        {p.skinTypes.length > 0 && <div>Skin: {p.skinTypes.join(", ")}</div>}{p.since && <div>On Nykaa since {new Date(p.since).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>}</div> },
  ];
  const v = a?.usp ? VERDICT[a.usp.analysis.review_check.usp_verdict] : null;
  const title = c ? `${c.anchor_position.unique_to_anchor.length} claim${c.anchor_position.unique_to_anchor.length === 1 ? " is" : "s are"} Innisfree's alone, ${c.table_stakes.length} are table stakes every rival makes${v ? `, and on its main promise ${v.label.toLowerCase()}` : ""}.`
    : "What each product says about itself on its Nykaa page.";
  return (
    <ActionSection id="proposition" kicker="Proposition · what each product sells itself on" title={title}
      note={c ? "Read from every photo in each product's Nykaa gallery, its page text and its reviews; then set against the other products in the group." : "No USP analysis for this category: showing Nykaa's own page text."}>
      {c && <Card className="mb-4 px-5 py-4"><div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">The group at a glance</div><p className="mt-1.5 max-w-[120ch] text-[13.5px] leading-relaxed text-ink-2">{c.group_summary}</p></Card>}
      <CompareGrid cols={cols} items={products} criteria={[]} extra={rows} labelWidth={150} />
      {c && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ListCard title="Points of parity: table stakes" note="Claims every listing here makes; they set no one apart." items={c.table_stakes.map((t) => ({ head: t.claim, foot: t.products_making_it.join(" · ") }))} empty="None." />
          <ListCard title="Points of difference: only Innisfree says" tone="good" items={c.anchor_position.unique_to_anchor.map((x) => ({ head: x }))} empty="Nothing Innisfree claims is unique in this group." />
          <ListCard title="White space: valued by buyers, claimed by no one" tone="good" items={c.white_space.map((w) => ({ head: w.opportunity, body: w.evidence }))} empty="None found." />
        </div>
      )}
      {hero && <p className="mt-3 text-[11.5px] text-muted">Analysed {new Date(hero.analysed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}; re-read only when a product&rsquo;s photos change.</p>}
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §4 battlecards */

/** One uniform card per rival: where Innisfree out-argues it, where it loses, what they share, and the numbers. */
export function Battlecards({ hero, products, colors }: { hero: UspComparison; products: ProductFacts[]; colors: Record<string, string> }) {
  const ap = hero.comparison.anchor_position;
  const a = products.find((p) => p.role === "anchor");
  const rivals = products.filter((p) => p !== a);
  const pick = <T,>(xs: T[], label: (x: T) => string, p: ProductFacts) => xs.filter((x) => matchRival(label(x), products) === p);
  const placed = new Set<unknown>();
  const cards = rivals.map((p) => {
    const st = pick(ap.stronger_than_rivals, (x) => x.rival, p); const wk = pick(ap.weaker_than_rivals, (x) => x.rival, p); const ov = pick(ap.overlaps_with, (x) => x.rival, p);
    [...st, ...wk, ...ov].forEach((x) => placed.add(x));
    return { p, st, wk, ov };
  });
  const loose = [...ap.stronger_than_rivals.filter((x) => !placed.has(x)).map((x) => ({ kind: "Stronger", ...x, text: x.where })),
    ...ap.weaker_than_rivals.filter((x) => !placed.has(x)).map((x) => ({ kind: "Weaker", ...x, text: x.where }))];
  const lose = cards.filter((x) => x.wk.length && !x.st.length).map((x) => x.p.brand);
  const win = cards.filter((x) => x.st.length && !x.wk.length).map((x) => x.p.brand);
  const title = `Innisfree out-argues ${win.length ? win.join(", ") : "no rival outright"}${lose.length ? `; ${lose.join(", ")} out-argue${lose.length === 1 ? "s" : ""} it` : ""}.`;
  const delta = (x: number | null, y: number | null, fmt: (v: number) => string) => (x === null || y === null ? "–" : fmt(x));
  return (
    <ActionSection id="rivals" kicker="Rival by rival · battlecards" title={title} note="Each card: where Innisfree's message is stronger or weaker than this rival, what they both say, this rival's own angle, and the head-to-head numbers.">
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map(({ p, st, wk, ov }) => (
          <Card key={p.pid} className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: colors[p.brand] }} />{ROLE_LABEL[p.role]}</div>
                <div className="mt-1 text-[14px] font-semibold">{p.brand} <span className="font-normal text-ink-2">{shortTitle(p.name, p.brand)}</span></div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
              {p.image && <img src={p.image} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-page object-contain ring-1 ring-line" />}
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2 rounded-xl bg-page px-3 py-2 text-[11.5px] tabular">
              <Num label="Price" v={delta(p.price, a?.price ?? null, inr)} sub={a?.price && p.price ? `${(p.price / a.price).toFixed(2)}× Innisfree` : ""} />
              <Num label="Shelf rank" v={p.rank ? `#${p.rank}` : "–"} sub={a ? (a.rank ? `Innisfree #${a.rank}` : "Innisfree not top 100") : ""} />
              <Num label="Ratings" v={compact(p.ratings)} sub={a ? `Innisfree ${compact(a.ratings)}` : ""} />
              <Num label="Reviews, 3 mo" v={p.recent === null ? "–" : compact(p.recent)} sub={a?.recent != null ? `Innisfree ${compact(a.recent)}` : ""} />
            </div>
            <Block title="Innisfree is stronger" tone="good" items={st.map((x) => x.where)} empty="No clear edge over this rival." />
            <Block title="Innisfree is weaker" tone="bad" items={wk.map((x) => x.where)} empty="This rival does not clearly out-argue it." />
            <Block title="Both say" items={ov.map((x) => x.shared_message)} empty="No shared message." />
            {p.groupRead && <Block title={`${p.brand}'s own angle`} items={[p.groupRead.distinct_angle]} empty="" />}
          </Card>
        ))}
      </div>
      {loose.length > 0 && (
        <Card className="mt-3 px-5 py-4">
          <div className="text-[13px] font-semibold">Across the group</div>
          <ul className="mt-1.5 space-y-1.5">{loose.map((x, i) => <li key={i} className="text-[12.5px] leading-snug"><span className={x.kind === "Stronger" ? "text-good" : "text-bad"}>{x.kind} vs {x.rival}: </span>{x.text}</li>)}</ul>
        </Card>
      )}
    </ActionSection>
  );
}

function Num({ label, v, sub }: { label: string; v: string; sub: string }) {
  return <div><div className="text-[10px] uppercase tracking-[0.08em] text-muted">{label}</div><div className="text-[13px] font-semibold">{v}</div><div className="text-[10.5px] text-muted">{sub}</div></div>;
}

function Block({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: "good" | "bad" }) {
  if (!items.length && !empty) return null;
  return (
    <div className="mt-3">
      <div className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-muted"}`}>{title}</div>
      {items.length ? <ul className="mt-1 space-y-1">{items.map((x, i) => <li key={i} className="text-[12.5px] leading-snug">{x}</li>)}</ul> : <p className="mt-1 text-[12px] text-muted">{empty}</p>}
    </div>
  );
}

type Item = { head?: string; body?: string; foot?: string };
export function ListCard({ title, note, items, empty, tone, n = 4 }: { title: string; note?: string; items: Item[]; empty: string; tone?: "good" | "bad"; n?: number }) {
  return (
    <Card className="px-5 py-4">
      <div className={`text-[13.5px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{title}</div>
      {note && <div className="text-[11.5px] text-muted">{note}</div>}
      <ul className="mt-2 space-y-2">
        <ShowAll n={n} items={items} empty={<p className="text-[12.5px] text-muted">{empty}</p>} render={(i, k) => (
          <li key={k} className="text-[12.5px] leading-snug">
            {i.head && <span className="font-medium">{i.head}</span>}
            {i.body && <span className="block text-ink-2"><More text={i.body} /></span>}
            {i.foot && <span className="mt-0.5 block text-[11px] text-muted">{i.foot}</span>}
          </li>
        )} />
      </ul>
    </Card>
  );
}
