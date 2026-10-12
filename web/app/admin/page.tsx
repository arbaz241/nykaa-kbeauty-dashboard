"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import AuthGate, { useIsAdmin, useSession } from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { ORIGIN_LABEL } from "@/lib/brands";
import People from "@/components/admin/People";
import { useShelf } from "@/lib/data";
import { fetchAll, supabase } from "@/lib/supabase";

interface BrandRow {
  brand: string; origin: string; source: string; confirmed: boolean; k_marketing: boolean; k_marketing_evidence: string | null;
  evidence: string | null; note: string | null; first_seen_date: string | null; updated_at: string; updated_by: string | null;
}
type Edit = Partial<Pick<BrandRow, "origin" | "confirmed" | "note" | "k_marketing">>;
const ORIGINS = ["kbeauty", "local", "global", "unknown"];

/** Brand classification: the origin label every share on the dashboard is built from. The collector classifies
 *  new brands automatically; an admin confirms or corrects them here. Confirmed rows are never overwritten. */
function AdminPage() {
  const isAdmin = useIsAdmin(); const session = useSession();
  const brands = useSWR("brand_classification", () => fetchAll<BrandRow>("brand_classification"), { revalidateOnFocus: false });
  const shelf = useShelf();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<string>("all");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"people" | "brands">("people");

  const slots = useMemo(() => {
    const m = new Map<string, number>(); (shelf.data ?? []).forEach((r) => m.set(r.brand, (m.get(r.brand) ?? 0) + 1)); return m;
  }, [shelf.data]);
  const list = useMemo(() => (brands.data ?? [])
    .filter((b) => (!onlyOpen || !b.confirmed) && (origin === "all" || b.origin === origin) && (!q || b.brand.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(/VERIFY/.test(b.evidence ?? "")) - Number(/VERIFY/.test(a.evidence ?? "")) || Number(a.origin !== "unknown") - Number(b.origin !== "unknown")
      || (slots.get(b.brand) ?? 0) - (slots.get(a.brand) ?? 0) || a.brand.localeCompare(b.brand)), [brands.data, onlyOpen, origin, q, slots]);
  const changed = Object.entries(edits).filter(([b, e]) => {
    const row = brands.data?.find((x) => x.brand === b); if (!row) return false;
    return (Object.keys(e) as (keyof Edit)[]).some((k) => (e[k] ?? null) !== (row[k] ?? null));
  });
  const val = <K extends keyof Edit>(b: BrandRow, k: K) => (edits[b.brand]?.[k] !== undefined ? edits[b.brand]![k] : b[k]) as BrandRow[K];
  const set = (b: string, e: Edit) => setEdits({ ...edits, [b]: { ...edits[b], ...e } });

  async function save() {
    setBusy(true); setMsg(null);
    let n = 0;
    for (const [brand, e] of changed) {
      const row = brands.data!.find((x) => x.brand === brand)!;
      const confirmed = e.confirmed ?? row.confirmed;
      const { error, count } = await supabase().from("brand_classification").update({
        ...e, ...(confirmed ? { source: "manual", confirmed: true } : {}), updated_at: new Date().toISOString(), updated_by: session?.user.email ?? null,
      }, { count: "exact" }).eq("brand", brand);
      if (error) { setBusy(false); setMsg({ kind: "err", text: `${brand}: ${error.message}` }); return; }
      n += count ?? 0;
    }
    setBusy(false); setEdits({}); await brands.mutate();
    setMsg(n ? { kind: "ok", text: `Saved ${n} brand${n === 1 ? "" : "s"}. The dashboard uses the new labels on its next load.` } : { kind: "err", text: "Nothing was saved: this account is not allowed to edit." });
  }

  const counts = useMemo(() => {
    const d = brands.data ?? []; return { all: d.length, open: d.filter((b) => !b.confirmed).length, unknown: d.filter((b) => b.origin === "unknown").length };
  }, [brands.data]);

  return (
    <Shell active="Admin">
      <PageHead eyebrow="Admin" title={tab === "people" ? "People" : "Brand classification"} sub={tab === "people"
        ? "Everyone who has an account: when they joined, their account id, when they were last on the dashboard and what they opened. Make or remove admins, and block or delete accounts."
        : "Every share on the dashboard depends on each brand's origin. New brands are classified automatically from Nykaa's country of origin and the Korean Beauty store; confirm or correct them here. Confirmed brands are never overwritten by the nightly run."} />
      {isAdmin && (
        <div className="mt-6 flex gap-1.5">
          {([["people", "People"], ["brands", "Brand classification"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-[13px] ring-1 ${tab === k ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      )}
      {!isAdmin ? <p className="mt-8 text-[14px] text-muted">Only admins can open this page.</p> : tab === "people" ? <People /> : !brands.data ? <Loading what="brands" /> : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand" className="w-56 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] outline-none focus:border-accent-strong" />
            <button onClick={() => setOnlyOpen(!onlyOpen)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 ${onlyOpen ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>Unconfirmed only ({counts.open})</button>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
              <option value="all">All origins</option>{ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}{o === "unknown" ? ` (${counts.unknown})` : ""}</option>)}
            </select>
            <span className="text-[12.5px] text-muted">{list.length} of {counts.all} brands</span>
            <button disabled={!changed.length || busy} onClick={save} className="ml-auto rounded-xl bg-brand px-4 py-2 text-[13px] font-medium text-on-brand disabled:opacity-40">
              {busy ? "Saving…" : `Save ${changed.length} change${changed.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {msg && <p className={`mt-3 text-[13px] ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
          <Card className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-3">Brand</th><th className="px-3 py-3">Origin</th><th className="px-3 py-3">Confirmed</th><th className="px-3 py-3" title="An Indian or global brand marketing itself as Korean">Korean-style marketing</th>
                <th className="px-3 py-3 text-right">Top-100 slots today</th><th className="px-3 py-3">Why the classifier chose it</th><th className="px-3 py-3">Note</th><th className="px-4 py-3">Last change</th>
              </tr></thead>
              <tbody>
                {list.map((b) => {
                  const dirty = changed.some(([x]) => x === b.brand); const verify = /VERIFY/.test(b.evidence ?? "");
                  return (
                    <tr key={b.brand} className={`border-b border-line/70 align-top ${dirty ? "bg-[#fffbe8]" : verify ? "bg-[#fdf3ef]" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{b.brand}{verify && <div className="text-[10.5px] font-semibold uppercase text-[#b4501f]">check: sources disagree</div>}</td>
                      <td className="px-3 py-2"><select value={val(b, "origin")} onChange={(e) => set(b.brand, { origin: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]">{ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}</select></td>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={val(b, "confirmed")} onChange={(e) => set(b.brand, { confirmed: e.target.checked })} className="h-4 w-4 accent-black" /></td>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={val(b, "k_marketing")} onChange={(e) => set(b.brand, { k_marketing: e.target.checked })} className="h-4 w-4 accent-black" title={b.k_marketing_evidence ?? ""} /></td>
                      <td className="px-3 py-2.5 text-right tabular">{slots.get(b.brand) ?? 0}</td>
                      <td className="max-w-[340px] px-3 py-2.5 text-[12px] leading-snug text-ink-2">{b.evidence ?? "–"}<div className="text-[11px] text-muted">source: {b.source}</div></td>
                      <td className="px-3 py-2"><input value={val(b, "note") ?? ""} onChange={(e) => set(b.brand, { note: e.target.value || null })} placeholder="–" className="w-44 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]" /></td>
                      <td className="px-4 py-2.5 text-[11.5px] text-muted">{new Date(b.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}<div>{b.updated_by ?? ""}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><AdminPage /></AuthGate>;
}
