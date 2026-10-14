"use client";

import { useState } from "react";
import { useSession } from "@/components/AuthGate";
import { Card, Loading } from "@/components/ui";
import { Missing } from "@/components/Detail";
import { NOTE_WORD, useDataNotes, type DataNote } from "@/lib/notes";
import { supabase } from "@/lib/supabase";
import { GROUP_LABEL, useTierRows, type TierGroup, type TierRow } from "@/lib/tiers";
import { tr } from "@/lib/i18n";

const input = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-strong";
const btn = "rounded-lg px-3 py-1.5 text-[12.5px] ring-1 ring-line hover:bg-sunken disabled:opacity-40";

/** Admin › Brand tiers: the pinned brand and the focus set every tab leads with (owner decision D5). */
export function TiersAdmin({ known }: { known: string[] }) {
  const { data, mutate, error } = useTierRows();
  const me = useSession()?.user.email ?? null;
  const [brand, setBrand] = useState(""); const [grp, setGrp] = useState<TierGroup>("korean");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false); setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok }); if (!error) mutate();
  }
  if (error) return <p className="mt-6 text-bad">{tr("Could not load tiers", "등급을 불러오지 못했습니다")}: {(error as Error).message}</p>;
  if (!data) return <Loading what={tr("brand tiers", "브랜드 등급")} />;
  const sb = () => supabase().from("brand_tiers");
  const pin = (r: TierRow) => run(async () => {
    const a = await sb().update({ tier: "focus", updated_at: new Date().toISOString(), updated_by: me }).eq("tier", "pinned");
    if (a.error) return a;
    return sb().update({ tier: "pinned", sort: 0, updated_at: new Date().toISOString(), updated_by: me }).eq("brand", r.brand);
  }, tr(`${r.brand} is now the pinned brand on every tab.`, `${r.brand}이(가) 모든 탭의 고정 브랜드가 되었습니다.`));

  return (
    <div className="mt-6">
      <p className="max-w-[760px] text-[13.5px] text-ink-2">{tr(<>The <b>pinned</b> brand is the anchor every tab is written around. <b>Focus</b> brands are the ones every tab leads with; every other brand sits behind a search box and only reaches a headline as a tagged outlier. Changes show on the next page load.</>, <><b>고정</b> 브랜드는 모든 탭이 기준으로 삼는 브랜드입니다. <b>주요</b> 브랜드는 모든 탭이 앞세우는 브랜드이며, 그 밖의 브랜드는 검색창 뒤에 있다가 눈에 띄는 변화가 있을 때만 표시와 함께 헤드라인에 오릅니다. 변경 사항은 다음에 페이지를 열 때 반영됩니다.</>)}</p>
      {msg && <p className={`mt-3 text-[13px] ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-3 py-2.5">{tr("Tier", "등급")}</th><th className="px-3 py-2.5">{tr("Group", "그룹")}</th><th className="px-3 py-2.5">{tr("On today’s data", "오늘 데이터에 있음")}</th><th className="px-4 py-2.5 text-right">{tr("Change", "변경")}</th></tr></thead>
          <tbody>{data.map((r) => {
            const found = known.some((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === r.brand.toLowerCase().replace(/[^a-z0-9]/g, ""));
            return (
              <tr key={r.brand} className={`border-b border-line last:border-0 ${r.tier === "pinned" ? "bg-accent-soft/50" : ""}`}>
                <td className="px-4 py-2 font-medium">{r.brand}{r.note && <span className="ml-2 text-[11.5px] font-normal text-muted">{r.note}</span>}</td>
                <td className="px-3 py-2">{r.tier === "pinned" ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11.5px] font-semibold text-on-brand">{tr("Pinned", "고정")}</span> : tr("Focus", "주요")}</td>
                <td className="px-3 py-2"><select value={r.grp} disabled={busy} onChange={(e) => run(() => sb().update({ grp: e.target.value, updated_at: new Date().toISOString(), updated_by: me }).eq("brand", r.brand), tr(`${r.brand} moved to ${GROUP_LABEL[e.target.value as TierGroup]}.`, `${r.brand}을(를) ${GROUP_LABEL[e.target.value as TierGroup]} 그룹으로 옮겼습니다.`))} className={input}>{(Object.keys(GROUP_LABEL) as TierGroup[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</select></td>
                <td className="px-3 py-2">{found ? <span className="text-good">{tr("found", "있음")}</span> : <Missing>{tr("not on today’s shelves or reviews: check the spelling", "오늘 진열·리뷰 데이터에 없음: 철자를 확인하세요")}</Missing>}</td>
                <td className="px-4 py-2 text-right">{r.tier !== "pinned" && <span className="inline-flex gap-1.5"><button disabled={busy} onClick={() => pin(r)} className={btn}>{tr("Make pinned", "고정으로 지정")}</button><button disabled={busy} onClick={() => run(() => sb().delete().eq("brand", r.brand), tr(`${r.brand} is no longer a focus brand.`, `${r.brand}을(를) 주요 브랜드에서 뺐습니다.`))} className={`${btn} text-bad`}>{tr("Remove", "제거")}</button></span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </Card>
      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); const b = brand.trim(); if (!b) return; run(() => sb().insert({ brand: b, tier: "focus", grp, sort: 100 + data.length, updated_by: me }), tr(`${b} added to the focus set.`, `${b}을(를) 주요 브랜드에 추가했습니다.`)); setBrand(""); }}>
        <input list="tier-brands" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={tr("Add a focus brand", "주요 브랜드 추가")} className={`${input} w-60`} />
        <datalist id="tier-brands">{known.filter((k) => !data.some((r) => r.brand.toLowerCase() === k.toLowerCase())).map((k) => <option key={k} value={k} />)}</datalist>
        <select value={grp} onChange={(e) => setGrp(e.target.value as TierGroup)} className={input}>{(Object.keys(GROUP_LABEL) as TierGroup[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</select>
        <button disabled={!brand.trim() || busy} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-on-brand disabled:opacity-40">{tr("Add", "추가")}</button>
      </form>
    </div>
  );
}

/** Admin › Data notes: every data gap, artifact, sale and launch, with cause and status. Charts draw markers from it. */
export function NotesAdmin() {
  const { data, mutate, error } = useDataNotes();
  const me = useSession()?.user.email ?? null;
  const blank = { starts_on: new Date().toISOString().slice(0, 10), ends_on: "", kind: "artifact" as DataNote["kind"], scope: "all" as DataNote["scope"], brand: "", title: "", detail: "", status: "open" as DataNote["status"] };
  const [f, setF] = useState(blank); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true); setMsg(null); const { error } = await fn(); setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok }); if (!error) mutate();
  }
  if (error) return <p className="mt-6 text-bad">{tr("Could not load data notes", "데이터 메모를 불러오지 못했습니다")}: {(error as Error).message}</p>;
  if (!data) return <Loading what={tr("data notes", "데이터 메모")} />;
  const SCOPE = (s: string) => tr(s === "all" ? "all tabs" : s, ({ all: "전체 탭", shelf: "진열", demand: "수요", search: "검색" } as Record<string, string>)[s] ?? s);
  const STATUS_WORD = (s: string) => tr(s, ({ explained: "설명됨", probable: "추정", open: "미해결" } as Record<string, string>)[s] ?? s);
  const sb = () => supabase().from("data_notes");
  const STATUS: Record<DataNote["status"], string> = { explained: "bg-good-soft text-good", probable: "bg-warn-soft text-warn", open: "bg-bad-soft text-bad" };
  return (
    <div className="mt-6">
      <p className="max-w-[760px] text-[13.5px] text-ink-2">{tr("Every coverage change, sale, launch and known data artifact, with its cause and whether it is explained. Charts on Demand and Market mark these dates so nobody misreads a jump.", "모든 수집 범위 변경, 세일, 출시, 알려진 데이터 왜곡과 그 원인, 설명 여부. 수요·시장 탭의 차트가 이 날짜를 표시해 급등락을 잘못 읽지 않게 합니다. 메모 내용은 입력한 그대로 보여 줍니다.")}</p>
      {msg && <p className={`mt-3 text-[13px] ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      <Card className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2.5">{tr("When", "날짜")}</th><th className="px-3 py-2.5">{tr("Type", "유형")}</th><th className="px-3 py-2.5">{tr("What and why", "내용과 원인")}</th><th className="px-3 py-2.5">{tr("Status", "상태")}</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody>{[...data].sort((a, b) => b.starts_on.localeCompare(a.starts_on)).map((n) => (
            <tr key={n.id} className="border-b border-line align-top last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 tabular">{n.starts_on}{n.ends_on ? ` → ${n.ends_on}` : ""}</td>
              <td className="px-3 py-2.5">{NOTE_WORD[n.kind]}<div className="text-[11px] text-muted">{SCOPE(n.scope)}{n.brand ? ` · ${n.brand}` : ""}</div></td>
              <td className="max-w-[520px] px-3 py-2.5"><b className="font-medium">{n.title}</b><div className="text-[12px] leading-snug text-ink-2">{n.detail}</div></td>
              <td className="px-3 py-2.5"><select value={n.status} disabled={busy} onChange={(e) => run(() => sb().update({ status: e.target.value, updated_by: me }).eq("id", n.id), tr("Status saved.", "상태를 저장했습니다."))} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${STATUS[n.status]}`}>{(["explained", "probable", "open"] as const).map((s) => <option key={s} value={s}>{STATUS_WORD(s)}</option>)}</select></td>
              <td className="px-4 py-2.5 text-right"><button disabled={busy} onClick={() => run(() => sb().delete().eq("id", n.id), tr("Note removed.", "메모를 삭제했습니다."))} className={`${btn} text-bad`}>{tr("Remove", "삭제")}</button></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <form className="mt-4 grid gap-2 rounded-[16px] bg-sunken/50 p-4 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); if (!f.title.trim()) return; run(() => sb().insert({ ...f, ends_on: f.ends_on || null, brand: f.brand || null, detail: f.detail || null, updated_by: me }), tr("Note added.", "메모를 추가했습니다.")); setF(blank); }}>
        <div className="text-[13px] font-semibold md:col-span-6">{tr("Add a note", "메모 추가")}</div>
        <input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} className={input} aria-label={tr("Starts on", "시작일")} />
        <input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} className={input} aria-label={tr("Ends on (optional)", "종료일 (선택)")} />
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as DataNote["kind"] })} className={input}>{(Object.keys(NOTE_WORD) as DataNote["kind"][]).map((k) => <option key={k} value={k}>{NOTE_WORD[k]}</option>)}</select>
        <select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as DataNote["scope"] })} className={input}>{(["all", "shelf", "demand", "search"] as const).map((k) => <option key={k} value={k}>{k === "all" ? tr("All tabs", "전체 탭") : SCOPE(k)}</option>)}</select>
        <input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} placeholder={tr("Brand (optional)", "브랜드 (선택)")} className={input} />
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as DataNote["status"] })} className={input}>{(["open", "probable", "explained"] as const).map((k) => <option key={k} value={k}>{STATUS_WORD(k)}</option>)}</select>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={tr("Short title, e.g. Nykaa Diwali sale", "짧은 제목 (예: Nykaa Diwali 세일)")} className={`${input} md:col-span-2`} />
        <input value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} placeholder={tr("What happened and why it matters", "무슨 일이 있었고 왜 중요한지")} className={`${input} md:col-span-3`} />
        <button disabled={!f.title.trim() || busy} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-on-brand disabled:opacity-40">{tr("Add note", "메모 추가")}</button>
      </form>
    </div>
  );
}
