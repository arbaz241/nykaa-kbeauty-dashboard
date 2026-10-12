"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Missing, Opens, Points, type DetailContent } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import Sparkline from "@/components/Sparkline";
import { shortTitle, type ProductFacts } from "@/lib/competeData";
import { CATEGORY_LABEL } from "@/lib/format";
import type { ThemeCount } from "@/lib/reviewThemes";
import { VERDICT } from "@/lib/usp";
import { BUYER_CRITERIA, DEMAND_CRITERIA, ProductHead, VIS_CRITERIA } from "./Overview";

const pc = (x: number) => `${Math.max(1, Math.round(x * 100))}%`;
const FEW = 30;

/* ---------------------------------------------------------------- §5 what buyers say */

function themesDetail(p: ProductFacts, kind: "praise" | "complaint"): DetailContent {
  const t = p.themes!; const xs = kind === "praise" ? t.praise : t.complaints;
  return {
    kicker: `${p.brand} · ${kind === "praise" ? "what buyers praise" : "what buyers complain about"}`, title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-muted">Counted from the text of {t.n} recent reviews ({t.low} rated 1–3★). {kind === "praise" ? "A theme counts when a review mentions it, e.g. “very hydrating”, and not “not hydrating”." : "Complaints count from 1–3★ reviews; from 4–5★ reviews only texture, scent, price, packaging and no-result complaints after “but”, “though” or “a bit” (shown as mild). Breakouts count only from 1–3★ reviews."}</p>
      {xs.length ? xs.map((x) => (
        <div key={x.key} className="mt-4">
          <div className="flex items-baseline justify-between gap-2"><b className="font-medium">{x.label}</b><span className="tabular text-ink-2">{x.n} reviews · {pc(x.share)}{x.mild ? ` · ${x.mild} mild` : ""}</span></div>
          {x.quotes.length > 0 && <Points className="mt-1 text-[12px] text-ink-2" items={x.quotes.map((q) => <i key={q}>&ldquo;{q}&rdquo;</i>)} />}
        </div>
      )) : <p className="mt-3">No {kind === "praise" ? "praise" : "complaint"} theme found in these reviews.</p>}
    </>),
  };
}

function aiReadDetail(p: ProductFacts): DetailContent {
  const r = p.usp!.analysis.review_check;
  return {
    kicker: `${p.brand} · paid review analysis`, title: shortTitle(p.name, p.brand),
    body: (<>
      <p className="text-muted">AI read of {r.reviews_considered} reviews (most-liked and most-recent), checking each claim the listing makes.</p>
      <DetailHead>Each claim, checked</DetailHead>
      <Points items={r.benefit_verdicts.map((b) => { const v = VERDICT[b.verdict]; return <><b className="font-medium">{b.benefit}</b> <span className={`text-[12px] ${v.tone}`}>{v.label}</span>{b.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{b.quotes[0]}&rdquo;</span>}</>; })} />
      <DetailHead>Valued but not advertised</DetailHead>
      {r.valued_but_not_advertised.length ? <Points tone="good" items={r.valued_but_not_advertised.map((x) => <>{x.theme} <span className="text-[12px] text-muted">({x.how_often})</span>{x.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{x.quotes[0]}&rdquo;</span>}</>)} /> : <Missing>Nothing beyond what the listing says</Missing>}
      <DetailHead>Recurring complaints</DetailHead>
      {r.recurring_complaints.length ? <Points tone="bad" items={r.recurring_complaints.map((x) => <>{x.theme} <span className="text-[12px] text-muted">({x.how_often})</span>{x.quotes[0] && <span className="block text-[12px] italic text-muted">&ldquo;{x.quotes[0]}&rdquo;</span>}</>)} /> : <Missing>No recurring complaint</Missing>}
    </>),
  };
}

function StarSplit({ split }: { split: Record<string, number> }) {
  const tot = Object.values(split).reduce((x, y) => x + y, 0) || 1;
  const low = ((split["1"] ?? 0) + (split["2"] ?? 0)) / tot;
  return (
    <div className="w-full max-w-[150px]">
      <div className="flex h-2 overflow-hidden rounded-full">
        {["5", "4", "3", "2", "1"].map((k) => <span key={k} style={{ width: `${((split[k] ?? 0) / tot) * 100}%`, background: Number(k) >= 4 ? (k === "5" ? "#0e3b2e" : "#5c5b56") : k === "3" ? "#b9b7ae" : "#c0352b" }} />)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted tabular">{Math.round((((split["5"] ?? 0) + (split["4"] ?? 0)) / tot) * 100)}% 4–5★ · {Math.round(low * 100)}% 1–2★</div>
    </div>
  );
}

const themeChips = (xs: ThemeCount[], tone: "good" | "bad") => xs.slice(0, 4).map((x) => (
  <Chip key={x.key} tone={tone}><span className={x.mild === x.n && tone === "bad" ? "opacity-70" : ""}>{x.label} {pc(x.share)}{tone === "bad" && x.mild === x.n ? " · mild" : ""}</span></Chip>
));

export function Buyers({ products, colors, loading }: { products: ProductFacts[]; colors: Record<string, string>; loading: boolean }) {
  const a = products.find((p) => p.role === "anchor");
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const few = (p: ProductFacts) => (p.themes && p.themes.n < FEW ? ` (only ${p.themes.n} reviews)` : "");
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "split", after: "rating", label: "Star split", help: "Share of all star ratings", has: (p) => !!p.split, missing: () => "Not shown on Nykaa", render: (p) => <StarSplit split={p.split!} /> },
    { key: "praise", label: "Praised for", help: "Themes counted in the review text (our count, same method for every product); click for numbers and quotes",
      has: (p) => !!p.themes?.n, missing: () => (loading ? "Loading…" : "No reviews collected"),
      render: (p) => p.themes!.praise.length ? <Opens detail={themesDetail(p, "praise")}><span className="flex flex-wrap gap-1">{themeChips(p.themes!.praise, "good")}</span>{few(p) && <span className="block text-[11px] text-muted">{few(p)}</span>}</Opens>
        : <Missing>No praise theme in {p.themes!.n} reviews</Missing> },
    { key: "complaints", label: "Complaints", help: "Complaint themes: all from 1–3★ reviews, plus mild ones raised inside 4–5★ reviews (lighter); click for the method and quotes",
      has: (p) => !!p.themes?.n, missing: () => (loading ? "Loading…" : "No reviews collected"),
      render: (p) => p.themes!.complaints.length ? <Opens detail={themesDetail(p, "complaint")}><span className="flex flex-wrap gap-1">{themeChips(p.themes!.complaints, "bad")}</span></Opens>
        : <Opens detail={themesDetail(p, "complaint")}><Missing>No complaint theme in {p.themes!.n} reviews</Missing></Opens> },
    { key: "nykaa", label: "Nykaa's tags", help: "Tags reviewers pick on Nykaa (% of tagged reviews) and Nykaa's own summary phrases. Not every product gets them, and tagged reviews are mostly positive, so they are shown apart from our count",
      has: (p) => !!p.themes?.tagged || p.phrases.length > 0, missing: () => (loading ? "Loading…" : "Nykaa shows no tags for this product"),
      render: (p) => (
        <div className="space-y-1">
          {!!p.themes?.tagged && <div className="flex flex-wrap gap-1">{p.themes.tags.slice(0, 3).map((t) => <Chip key={t.label} tone="plain">{t.label} {pc(t.share)}</Chip>)}</div>}
          {p.phrases.length > 0 && <Opens detail={{ kicker: `${p.brand} · Nykaa's review summary`, title: shortTitle(p.name, p.brand), body: <>
            <DetailHead>Positive</DetailHead><div className="flex flex-wrap gap-1">{p.phrases.filter((x) => x.sentiment === "Positive").map((x) => <Chip key={x.text} tone="good">{x.text}</Chip>)}</div>
            <DetailHead>Negative</DetailHead><div className="flex flex-wrap gap-1">{p.phrases.filter((x) => x.sentiment !== "Positive").map((x) => <Chip key={x.text} tone="bad">{x.text}</Chip>)}</div>
            {!!p.themes?.tagged && <><DetailHead>Reviewer tags ({p.themes.tagged} tagged reviews)</DetailHead><Points items={p.themes.tags.map((t) => `${t.label}: ${pc(t.share)}${t.negative ? ` (${t.negative} negative)` : ""}`)} /></>}
          </> }}><span className="text-[11.5px] text-ink-2">{p.phrases.length} Nykaa phrases</span></Opens>}
        </div>) },
    { key: "ai", label: "Paid review analysis", help: "The AI read of each claim against the reviews, with what buyers value unprompted and recurring complaints",
      has: (p) => !!p.usp, missing: (p) => (p.role === "rival" ? "Not in an analysed group" : "Not analysed"),
      render: (p) => { const r = p.usp!.analysis.review_check; return (
        <Opens detail={aiReadDetail(p)}><span className="block text-[12px] leading-snug">
          <span className="text-good">{r.valued_but_not_advertised.length} valued unprompted</span> · <span className="text-bad">{r.recurring_complaints.length} complaint{r.recurring_complaints.length === 1 ? "" : "s"}</span>
          <span className="block text-[11px] text-muted">{r.reviews_considered} reviews read</span></span></Opens>); } },
  ];
  const praise = a?.themes?.praise[0]; const comp = a?.themes?.complaints[0];
  const title = a && praise
    ? `Buyers praise ${shortTitle(a.name, a.brand)} most for “${praise.label.toLowerCase()}” (${pc(praise.share)} of reviews)${comp ? `; the top complaint is “${comp.label.toLowerCase()}” (${pc(comp.share)})` : "; no complaint theme stands out"}.`
    : "What reviewers say, product by product.";
  return (
    <ActionSection id="buyers" kicker="What buyers say · reviews" title={title}
      note="Three layers: our count of themes in the review text (the same for every product), Nykaa's own tags where it shows them, and the paid AI review read one click away. Percentages are of all stored recent reviews, so short reviews (“good product”) lower them evenly for everyone.">
      <CompareGrid cols={cols} items={products} criteria={BUYER_CRITERIA} extra={extra} labelWidth={150} />
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §6 visibility, §7 demand */

export function Visibility({ products, colors, cat }: { products: ProductFacts[]; colors: Record<string, string>; cat: string }) {
  const a = products.find((p) => p.role === "anchor");
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const SHOT = (s: string | null) => (s ?? "").replaceAll("_", " ");
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "thumb", label: "Thumbnail style", help: "How the main image reads in the grid (click a product image for the full read)", has: (p) => !!p.thumb?.shot_type,
      missing: () => "Image not analysed yet",
      render: (p) => <div className="flex flex-wrap gap-1"><Chip>{SHOT(p.thumb!.shot_type)}</Chip><Chip>{p.thumb!.text_density === "heavy" ? "text-heavy" : p.thumb!.text_density === "light" ? "light text" : "no text"}</Chip>{p.thumb!.model_present && <Chip>shows a person</Chip>}</div> },
  ];
  const higher = a ? products.filter((p) => p !== a && p.rank && (!a.rank || p.rank < a.rank)).length : 0;
  const title = a ? `${a.rank ? `#${a.rank} in ${CATEGORY_LABEL[cat]} today` : `Not in today's ${CATEGORY_LABEL[cat]} top 100`}; ${higher} of ${products.length - 1} rivals sit higher${a.search ? `, and it shows in ${a.search} K-beauty search${a.search === 1 ? "" : "es"}` : ", and it shows in no tracked K-beauty search"}.` : "Shelf position and search.";
  return (
    <ActionSection id="visibility" kicker="Visibility · shelf and search" title={title} note="Green where Innisfree beats that rival, red where it trails, grey on par (within 3 places or 5%). LEAD marks a clear best.">
      <CompareGrid cols={cols} items={products} criteria={VIS_CRITERIA} extra={extra} colors={products.map((p) => colors[p.brand])} labelWidth={150} />
    </ActionSection>
  );
}

export function Demand({ products, colors }: { products: ProductFacts[]; colors: Record<string, string> }) {
  const a = products.find((p) => p.role === "anchor");
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "spark", after: "momentum", label: "12-month trend", help: "Reviews per month over the last 12 complete months", has: (p) => !!p.spark?.some((v) => v !== null),
      missing: () => "No review history tracked", render: (p) => <Sparkline values={p.spark!} color={colors[p.brand] ?? "#8a8880"} width={140} height={30} /> },
  ];
  const top = [...products].filter((p) => p.recent !== null).sort((x, y) => y.recent! - x.recent!)[0];
  const title = a?.recent != null
    ? `${shortTitle(a.name, a.brand)} drew ${a.recent} reviews in 3 months${a.momentum !== null ? ` (${a.momentum >= 0 ? "+" : ""}${Math.round(a.momentum * 100)}% vs Apr–Jun)` : ""}${top && top !== a ? `; ${top.brand} leads with ${top.recent}` : "; the most in the group"}.`
    : "Recent reviews, a stand-in for sales.";
  return (
    <ActionSection id="demand" kicker="Demand · reviews as a sales signal" title={title} note="Nykaa does not publish sales; new reviews per month track them closely. Products outside the review-history set are marked.">
      <CompareGrid cols={cols} items={products} criteria={DEMAND_CRITERIA} extra={extra} colors={products.map((p) => colors[p.brand])} labelWidth={150} />
    </ActionSection>
  );
}
