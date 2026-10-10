"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Level, Missing, Opens, Points, type DetailContent } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import { Card } from "@/components/ui";
import { matchRival, shortTitle, type ProductFacts } from "@/lib/competeData";
import { clause } from "@/lib/format";
import type { UspComparison } from "@/lib/usp";
import { ProductHead } from "./Overview";

/* ---------------------------------------------------------------- §3 message */

const notAnalysed = (p: ProductFacts) => (p.role === "rival" ? "Not in an analysed group" : "Not analysed");

function promiseDetail(p: ProductFacts): DetailContent {
  const m = p.usp!.analysis.main_usp;
  return {
    kicker: `${p.brand} · main promise`, title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-[14px] font-medium leading-snug">{m.statement}</p>
      {m.brand_words && <><DetailHead>In the brand&rsquo;s words</DetailHead><p className="italic text-ink-2">&ldquo;{m.brand_words}&rdquo;</p></>}
      <DetailHead>Why this is the lead message</DetailHead><Points items={m.why_this_is_the_usp.split(/(?<=[.!?])\s+/).slice(0, 4)} />
      {m.runner_up && <><DetailHead>Runner-up message</DetailHead><p className="text-ink-2">{m.runner_up}</p></>}
      <p className="mt-4 text-[12px] text-muted">Confidence {m.confidence}. Read from every photo in the Nykaa gallery and the page text.</p>
    </>),
  };
}

function benefitsDetail(p: ProductFacts): DetailContent {
  const a = p.usp!.analysis;
  return {
    kicker: `${p.brand} · benefits and ingredients`, title: shortTitle(p.name, p.brand),
    body: (<>
      <DetailHead>Benefits claimed, most emphasised first</DetailHead>
      <Points items={[...a.key_benefits].sort((x, y) => y.emphasis - x.emphasis).map((b) => <><b className="font-medium">{b.benefit}</b><span className="block text-[12px] text-muted">{b.proof_type === "none" ? "no proof offered" : `${b.proof_type.replaceAll("_", " ")}${b.proof_detail ? `: ${b.proof_detail}` : ""}`}</span></>)} />
      {!!a.hero_ingredients.length && <><DetailHead>Hero ingredients and their claimed role</DetailHead><Points items={a.hero_ingredients.map((h) => <><b className="font-medium">{h.ingredient}</b>: {h.claimed_role}</>)} /></>}
      {a.emotional_and_brand_angle && <><DetailHead>Brand and emotional angle</DetailHead><p className="text-ink-2">{a.emotional_and_brand_angle}</p></>}
    </>),
  };
}

function whoDetail(p: ProductFacts): DetailContent {
  const t = p.usp?.analysis.target_consumer;
  return {
    kicker: `${p.brand} · who it is for`, title: shortTitle(p.name, p.brand),
    body: (<>
      {t && <p className="text-ink-2">{t.summary}</p>}
      {(p.skinTypes.length > 0 || p.concerns.length > 0) && <><DetailHead>On the Nykaa page</DetailHead><Points items={[...(p.skinTypes.length ? [`Skin type: ${p.skinTypes.join(", ")}`] : []), ...(p.concerns.length ? [`Concern: ${p.concerns.join(", ")}`] : [])]} /></>}
      {t && <><DetailHead>Read from the listing</DetailHead><Points items={t.attributes.map((x) => <><b className="font-medium">{x.dimension.replaceAll("_", " ")}</b>: {x.value} <span className="text-[11.5px] text-muted">({x.basis})</span></>)} /></>}
    </>),
  };
}

function versusDetail(p: ProductFacts, hero: UspComparison, products: ProductFacts[]): DetailContent {
  const ap = hero.comparison.anchor_position;
  const mine = <T,>(xs: T[], f: (x: T) => string) => xs.filter((x) => matchRival(f(x), products) === p);
  const st = mine(ap.stronger_than_rivals, (x) => x.rival); const wk = mine(ap.weaker_than_rivals, (x) => x.rival); const ov = mine(ap.overlaps_with, (x) => x.rival);
  return {
    kicker: `Innisfree vs ${p.brand}`, title: shortTitle(p.name, p.brand),
    body: (<>
      <DetailHead>Where Innisfree&rsquo;s message is stronger</DetailHead>{st.length ? <Points tone="good" items={st.map((x) => x.where)} /> : <Missing>No clear edge over this rival</Missing>}
      <DetailHead>Where it is weaker</DetailHead>{wk.length ? <Points tone="bad" items={wk.map((x) => x.where)} /> : <Missing>This rival does not clearly out-argue it</Missing>}
      <DetailHead>What both say</DetailHead>{ov.length ? <Points items={ov.map((x) => x.shared_message)} /> : <Missing>No shared message</Missing>}
      {p.groupRead && <><DetailHead>{p.brand}&rsquo;s own angle</DetailHead><p className="text-ink-2">{p.groupRead.distinct_angle}</p></>}
    </>),
  };
}

export function versusCounts(p: ProductFacts, hero: UspComparison, products: ProductFacts[]) {
  const ap = hero.comparison.anchor_position;
  const n = <T,>(xs: T[], f: (x: T) => string) => xs.filter((x) => matchRival(f(x), products) === p).length;
  return { st: n(ap.stronger_than_rivals, (x) => x.rival), wk: n(ap.weaker_than_rivals, (x) => x.rival), ov: n(ap.overlaps_with, (x) => x.rival) };
}

export function Message({ hero, products, colors }: { hero: UspComparison | null; products: ProductFacts[]; colors: Record<string, string> }) {
  const a = products.find((p) => p.role === "anchor");
  const c = hero?.comparison;
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const has = (p: ProductFacts) => !!p.usp;
  const benefits = (p: ProductFacts) => [...p.usp!.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis);
  const rows: ExtraRow<ProductFacts>[] = [
    { key: "promise", label: "Main promise", help: "The one message the listing leads on; click for the full statement", has, missing: notAnalysed,
      render: (p) => <Opens detail={promiseDetail(p)}><span className="text-[12.5px] font-medium leading-snug">{p.promise}</span></Opens> },
    { key: "benefits", label: "Key benefits", help: "Most emphasised first; click for the proof behind each", has, missing: notAnalysed,
      render: (p) => <div className="flex flex-wrap gap-1">{benefits(p).slice(0, 4).map((b) => <Chip key={b.benefit}>{clause(b.benefit, 5)}</Chip>)}
        <Opens detail={benefitsDetail(p)}><span className="text-[11.5px] text-ink-2">{benefits(p).length > 4 ? `+${benefits(p).length - 4} more` : "detail"}</span></Opens></div> },
    { key: "ingredients", label: "Hero ingredients", has: (p) => !!p.usp?.analysis.hero_ingredients.length || p.ingredients.length > 0,
      missing: (p) => (p.usp ? "No ingredient named as the hero" : "No ingredients listed"),
      render: (p) => <div className="flex flex-wrap gap-1">{(p.usp?.analysis.hero_ingredients.length ? p.usp.analysis.hero_ingredients.map((h) => h.ingredient) : p.ingredients).slice(0, 4).map((x) => <Chip key={x} tone="plain">{clause(x, 4)}</Chip>)}</div> },
    { key: "proof", label: "Proof of claims", help: "How well the listing proves what it claims (clinical numbers, tests, before/after); click for the reasons", has, missing: notAnalysed,
      render: (p) => <Level level={p.proof.level} reasons={p.proof.reasons} title="Proof of claims" kicker={`${p.brand} · ${shortTitle(p.name, p.brand)}`} /> },
    { key: "echo", label: "Buyers repeat it", help: "Share of the product's claims that its reviewers say back: 60%+ strong, 30–59% moderate, under 30% weak", has, missing: notAnalysed,
      render: (p) => <Level level={p.echo.level} reasons={p.echo.reasons} none={p.echo.none} title="Buyers repeat its claims" kicker={`${p.brand} · ${shortTitle(p.name, p.brand)}`} /> },
    { key: "who", label: "Who it's for", help: "Skin type and concerns from the Nykaa page and the listing read; click for age, routine and evidence",
      has: (p) => p.whoFor.skin.length + p.whoFor.concerns.length > 0 || !!p.whoFor.age, missing: () => "No target stated on the page",
      render: (p) => (
        <Opens detail={whoDetail(p)}><div className="space-y-1">
          {p.whoFor.skin.length > 0 && <div className="flex flex-wrap gap-1"><span className="text-[11px] text-muted">Skin</span>{p.whoFor.skin.map((x) => <Chip key={x}>{x}</Chip>)}</div>}
          {p.whoFor.concerns.length > 0 && <div className="flex flex-wrap gap-1"><span className="text-[11px] text-muted">For</span>{p.whoFor.concerns.slice(0, 4).map((x) => <Chip key={x}>{x}</Chip>)}</div>}
          {p.whoFor.age && <div className="text-[11.5px] leading-snug text-ink-2">{p.whoFor.age}</div>}
        </div></Opens>) },
    { key: "angle", label: "Distinct angle", help: "What sets it apart within this group", has: (p) => !!p.groupRead, missing: notAnalysed,
      render: (p) => <Opens detail={{ kicker: `${p.brand} · distinct angle`, title: shortTitle(p.name, p.brand), body: <><p>{p.groupRead!.distinct_angle}</p><DetailHead>Credibility: {p.groupRead!.credibility}</DetailHead><p className="text-ink-2">{p.groupRead!.credibility_reason}</p><DetailHead>Do buyers echo it</DetailHead><p className="text-ink-2">{p.groupRead!.buyers_echo_it}</p></> }}>
        <span className="text-[12.5px] leading-snug">{clause(p.groupRead!.distinct_angle, 10)}</span></Opens> },
    ...(hero ? [{ key: "versus", label: "Innisfree vs this rival", help: "Where Innisfree's message is stronger, weaker or the same as this rival's; click for each point",
      render: (p: ProductFacts) => {
        if (p === a) return <span className="text-[11.5px] text-muted">The product being compared</span>;
        const n = versusCounts(p, hero, products);
        return <Opens detail={versusDetail(p, hero, products)}><span className="flex flex-wrap gap-1"><Chip tone="good">stronger {n.st}</Chip><Chip tone="bad">weaker {n.wk}</Chip><Chip>shared {n.ov}</Chip></span></Opens>;
      } }] : []),
  ];
  const lvl = a?.echo.level;
  const title = c ? `${c.anchor_position.unique_to_anchor.length} claim${c.anchor_position.unique_to_anchor.length === 1 ? " is" : "s are"} Innisfree's alone and ${c.table_stakes.length} are made by every rival${lvl ? `; buyers' echo of its claims is ${lvl}` : ""}.`
    : "What each product says about itself.";
  return (
    <ActionSection id="message" kicker="Message · what each product sells itself on" title={title}
      note={c ? <>Read from every photo in each product&rsquo;s Nykaa gallery, its page text and its reviews. Levels use one scale: <b>strong · moderate · weak</b>; click a level for the reasons. {<Opens className="ml-1" detail={{ kicker: "AI read of the whole group", title: "The group at a glance", body: <Points items={c.group_summary.split(/(?<=[.!?])\s+/)} /> }}>Group summary</Opens>}</>
        : "No message analysis for this category yet: rows show what the Nykaa page states."}>
      <CompareGrid cols={cols} items={products} criteria={[]} extra={rows} labelWidth={150} />
      {c && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Bucket title="Table stakes" help="Claims every product here makes: needed to compete, but they set no one apart." tone={undefined}
            items={c.table_stakes.map((t) => ({ head: clause(t.claim, 9), detail: { kicker: "Table stake", title: t.claim, body: <><DetailHead>Made by</DetailHead><Points items={t.products_making_it} /></> } }))} empty="None found." />
          <Bucket title="Only Innisfree says" help="Points of difference: claims no rival in this group makes." tone="good"
            items={c.anchor_position.unique_to_anchor.map((x) => ({ head: clause(x, 9), detail: { kicker: "Point of difference", title: x, body: <p className="text-muted">No rival in this group makes this claim.</p> } }))} empty="Nothing Innisfree claims is unique here." />
          <Bucket title="White space" help="What buyers value that no listing here claims: an opening for Innisfree." tone="good"
            items={c.white_space.map((w) => ({ head: clause(w.opportunity, 9), detail: { kicker: "White space", title: w.opportunity, body: <><DetailHead>Evidence</DetailHead><Points items={w.evidence.split(/(?<=[.!?])\s+/)} /></> } }))} empty="None found." />
        </div>
      )}
      {hero && <p className="mt-3 text-[11.5px] text-muted">Analysed {new Date(hero.analysed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}; re-read only when a product&rsquo;s photos change.</p>}
    </ActionSection>
  );
}

/** One labelled list with a count and a one-line meaning; each point opens its detail. */
export function Bucket({ title, help, items, empty, tone }: { title: string; help: string; items: { head: string; detail: DetailContent }[]; empty: string; tone?: "good" | "bad" }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className={`text-[13.5px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{title}</div>
        <span className="rounded-full bg-sunken px-2 py-px text-[11.5px] font-semibold tabular text-ink-2">{items.length}</span>
      </div>
      <div className="text-[11.5px] leading-snug text-muted">{help}</div>
      {items.length ? <Points className="mt-2.5 text-[12.5px]" tone={tone} items={items.map((i) => <Opens key={i.head} detail={i.detail}>{i.head}</Opens>)} /> : <p className="mt-2 text-[12.5px] text-muted">{empty}</p>}
    </Card>
  );
}
