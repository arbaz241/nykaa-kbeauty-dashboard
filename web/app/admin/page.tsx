"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import AuthGate, { useIsAdmin, useSession } from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { ORIGIN_LABEL } from "@/lib/brands";
import People from "@/components/admin/People";
import { NotesAdmin, TiersAdmin } from "@/components/admin/Settings";
import { useShelf } from "@/lib/data";
import { fetchAll, supabase } from "@/lib/supabase";
import { dayMonth, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

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
  const [tab, setTab] = useState<"people" | "brands" | "tiers" | "notes">("people");

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
    // the tabs read ready-made copies (migrations 020-022), rebuilt after the nightly run; a rebuild (~10 s) is
    // longer than a signed-in request may run, so the new origins reach the tabs with tonight's update
    setBusy(false); setEdits({}); await brands.mutate();
    setMsg(n ? { kind: "ok", text: tr(`Saved ${n} brand${n === 1 ? "" : "s"}. The tabs show the new labels after tonight's update.`, `브랜드 ${n}개를 저장했습니다. 오늘 밤 업데이트 후 각 탭에 반영됩니다.`) } : { kind: "err", text: tr("Nothing was saved: this account is not allowed to edit.", "저장되지 않았습니다: 이 계정에는 편집 권한이 없습니다.") });
  }

  const counts = useMemo(() => {
    const d = brands.data ?? []; return { all: d.length, open: d.filter((b) => !b.confirmed).length, unknown: d.filter((b) => b.origin === "unknown").length };
  }, [brands.data]);

  return (
    <Shell active="Admin">
      <PageHead eyebrow={tr("Admin", "관리")} title={{ people: tr("People", "사용자"), brands: tr("Brand classification", "브랜드 분류"), tiers: tr("Brand tiers", "브랜드 등급"), notes: tr("Data notes", "데이터 메모") }[tab]} sub={tab === "tiers" ? tr("The pinned brand and the focus set that every tab leads with.", "모든 탭이 앞세우는 고정 브랜드와 주요 브랜드 목록.") : tab === "notes" ? tr("The data-quality log: coverage changes, sales, launches and artifacts, with cause and status.", "데이터 품질 기록: 수집 범위 변경, 세일, 출시, 데이터 왜곡과 그 원인·상태.") : tab === "people"
        ? tr("Everyone who has an account: when they joined, their account id, when they were last on the dashboard and what they opened. Make or remove admins, and block or delete accounts.", "계정이 있는 모든 사용자: 가입일, 계정 ID, 마지막 접속일, 열어 본 페이지. 관리자 지정·해제, 계정 차단·삭제를 할 수 있습니다.")
        : tr("Every share on the dashboard depends on each brand's origin. New brands are classified automatically from Nykaa's country of origin and the Korean Beauty store; confirm or correct them here. Confirmed brands are never overwritten by the nightly run.", "대시보드의 모든 점유율은 브랜드 국적에 따라 달라집니다. 새 브랜드는 Nykaa의 원산지 정보와 K-뷰티 스토어를 근거로 자동 분류되며, 여기서 확인하거나 고칠 수 있습니다. 확인한 브랜드는 매일 밤 수집에서 덮어쓰지 않습니다.")} />
      {isAdmin && (
        <div className="mt-6 flex gap-1.5">
          {([["people", tr("People", "사용자")], ["tiers", tr("Brand tiers", "브랜드 등급")], ["notes", tr("Data notes", "데이터 메모")], ["brands", tr("Brand classification", "브랜드 분류")]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3.5 py-1.5 text-[13px] ring-1 ${tab === k ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      )}
      {!isAdmin ? <p className="mt-8 text-[14px] text-muted">{tr("Only admins can open this page.", "관리자만 열 수 있는 페이지입니다.")}</p>   : tab === "people" ? <People /> : tab === "tiers" ? <TiersAdmin known={[...slots.keys()]} /> : tab === "notes" ? <NotesAdmin /> : !brands.data ? <Loading what={tr("brands", "브랜드")} /> : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search brand", "브랜드 검색")} className="w-56 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] outline-none focus:border-accent-strong" />
            <button onClick={() => setOnlyOpen(!onlyOpen)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 ${onlyOpen ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{tr("Needs your check", "확인 필요")} ({counts.open})</button>
            <span className="basis-full text-[12px] text-muted">{tr("17 Oct: brands with clear evidence (the seed list, or Nykaa's country of origin agreeing on 2+ products, 3+ for Korea) were confirmed automatically, marked \"auto-rule\". What is left is doubtful: one product to judge from, no signal, made in Korea by a possibly non-Korean brand, or brands marketed as Korean.", "10월 17일: 근거가 분명한 브랜드(초기 목록, 또는 Nykaa 원산지가 2개 이상 제품에서 일치, 한국은 3개 이상)는 자동 확인했습니다(\"auto-rule\" 표시). 남은 것은 판단이 필요한 브랜드입니다: 제품 1개뿐, 근거 없음, 한국 제조지만 한국 브랜드가 아닐 수 있음, 한국풍 마케팅 브랜드.")}</span>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px]">
              <option value="all">{tr("All origins", "전체 국적")}</option>{ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}{o === "unknown" ? ` (${counts.unknown})` : ""}</option>)}
            </select>
            <span className="text-[12.5px] text-muted">{tr(`${list.length} of ${counts.all} brands`, `브랜드 ${counts.all}개 중 ${list.length}개`)}</span>
            <button disabled={!changed.length || busy} onClick={save} className="ml-auto rounded-xl bg-brand px-4 py-2 text-[13px] font-medium text-on-brand disabled:opacity-40">
              {busy ? tr("Saving…", "저장 중…") : tr(`Save ${changed.length} change${changed.length === 1 ? "" : "s"}`, `변경 ${changed.length}건 저장`)}
            </button>
          </div>
          {msg && <p className={`mt-3 text-[13px] ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>}
          <Card className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-3">{tr("Brand", "브랜드")}</th><th className="px-3 py-3">{tr("Origin", "국적")}</th><th className="px-3 py-3">{tr("Confirmed", "확인")}</th><th className="px-3 py-3" title={tr("An Indian or global brand marketing itself as Korean", "한국 브랜드처럼 마케팅하는 인도·글로벌 브랜드")}>{tr("Korean-style marketing", "K-스타일 마케팅")}</th>
                <th className="px-3 py-3 text-right">{tr("Top-100 slots today", "오늘 상위 100위 자리")}</th><th className="px-3 py-3">{tr("Why the classifier chose it", "자동 분류 근거")}</th><th className="px-3 py-3">{tr("Note", "메모")}</th><th className="px-4 py-3">{tr("Last change", "최근 변경")}</th>
              </tr></thead>
              <tbody>
                {list.map((b) => {
                  const dirty = changed.some(([x]) => x === b.brand); const verify = /VERIFY/.test(b.evidence ?? "");
                  return (
                    <tr key={b.brand} className={`border-b border-line/70 align-top ${dirty ? "bg-[#fffbe8]" : verify ? "bg-[#fdf3ef]" : ""}`}>
                      <td className="px-4 py-2.5 font-medium">{b.brand}{verify && <div className="text-[10.5px] font-semibold uppercase text-[#b4501f]">{tr("check: sources disagree", "확인 필요: 출처 불일치")}</div>}</td>
                      <td className="px-3 py-2"><select value={val(b, "origin")} onChange={(e) => set(b.brand, { origin: e.target.value })} className="rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]">{ORIGINS.map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}</select></td>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={val(b, "confirmed")} onChange={(e) => set(b.brand, { confirmed: e.target.checked })} className="h-4 w-4 accent-black" /></td>
                      <td className="px-3 py-2.5"><input type="checkbox" checked={val(b, "k_marketing")} onChange={(e) => set(b.brand, { k_marketing: e.target.checked })} className="h-4 w-4 accent-black" title={b.k_marketing_evidence ?? ""} /></td>
                      <td className="px-3 py-2.5 text-right tabular">{slots.get(b.brand) ?? 0}</td>
                      <td className="max-w-[340px] px-3 py-2.5 text-[12px] leading-snug text-ink-2">{tx(b.evidence) ?? "–"}<div className="text-[11px] text-muted">{tr("source", "출처")}: {b.source}</div></td>
                      <td className="px-3 py-2"><input value={val(b, "note") ?? ""} onChange={(e) => set(b.brand, { note: e.target.value || null })} placeholder="–" className="w-44 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px]" /></td>
                      <td className="px-4 py-2.5 text-[11.5px] text-muted">{dayMonth(b.updated_at)}<div>{b.updated_by ?? ""}</div></td>
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
