"use client";

import { Card } from "@/components/ui";
import { shortName } from "@/lib/format";
import { VERDICT, type UspComparison, type UspProduct } from "@/lib/usp";

/** The full USP read for one hero product, in depth. Shown on demand under Competitive Analysis. */
export default function UspDetail({ g, anchor }: { g: UspComparison; anchor?: UspProduct }) {
  const c = g.comparison; const ap = c.anchor_position;
  return (
    <div className="space-y-4">
      <Card className="px-5 py-4">
        <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Full verdict</div>
        <p className="mt-1.5 max-w-[110ch] text-[14px] leading-relaxed">{ap.verdict}</p>
        <p className="mt-3 max-w-[110ch] text-[13px] leading-relaxed text-ink-2">{c.group_summary}</p>
        <p className="mt-3 text-[13px] text-ink-2"><span className="text-muted">Innisfree&rsquo;s buyers vs rivals&rsquo; buyers: </span>{ap.review_resonance_vs_rivals}</p>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="Where Innisfree is stronger" tone="good" items={ap.stronger_than_rivals.map((x) => ({ head: x.rival, body: x.where }))} empty="No rival it clearly out-argues." />
        <ListCard title="Where Innisfree is weaker" tone="bad" items={ap.weaker_than_rivals.map((x) => ({ head: x.rival, body: x.where }))} empty="No rival clearly out-argues it." />
        <ListCard title="Only Innisfree says" items={ap.unique_to_anchor.map((x) => ({ body: x }))} empty="Nothing Innisfree claims is unique in this group." />
        <ListCard title="Messages it shares with rivals" items={ap.overlaps_with.map((x) => ({ head: x.rival, body: x.shared_message }))} empty="No overlap." />
        <ListCard title="Table stakes: claims everyone makes" note="These don't set anyone apart."
          items={c.table_stakes.map((t) => ({ body: t.claim, foot: t.products_making_it.join(" · ") }))} empty="None." />
        <ListCard title="White space" note="What buyers in this group value that no listing claims clearly." tone="good"
          items={c.white_space.map((w) => ({ head: w.opportunity, body: w.evidence }))} empty="None found." />
      </div>
      {anchor && <BuyerEcho p={anchor} />}
      <p className="text-[12px] text-muted">
        Analysed {new Date(g.analysed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} from every photo in each Nykaa gallery, the page text and reviews. Re-read only when a product&rsquo;s photos change.
      </p>
    </div>
  );
}

function BuyerEcho({ p }: { p: UspProduct }) {
  const r = p.analysis.review_check;
  return (
    <div>
      <div className="mb-2 mt-2 text-[14px] font-semibold">Do Innisfree&rsquo;s buyers say it back? <span className="text-[12px] font-normal text-muted">From {r.reviews_considered} reviews of {shortName(p.name, p.brand).split(/ [-–|,]/)[0]}</span></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ListCard title="Each claim, checked" items={r.benefit_verdicts.map((b) => ({ head: b.benefit, tag: VERDICT[b.verdict], body: b.explanation, quote: b.quotes[0] }))} empty="—" />
        <ListCard title="Valued but not advertised" tone="good" items={r.valued_but_not_advertised.map((x) => ({ head: x.theme, body: x.how_often, quote: x.quotes[0] }))} empty="Nothing beyond what the listing says." />
        <ListCard title="Recurring complaints" tone="bad" items={r.recurring_complaints.map((x) => ({ head: x.theme, body: x.how_often, quote: x.quotes[0] }))} empty="No recurring complaint." />
      </div>
    </div>
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
