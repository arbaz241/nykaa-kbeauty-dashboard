"use client";

import { tx } from "@/lib/dict";

import { useMemo, useState } from "react";
import { useIsAdmin, useSession } from "./AuthGate";
import { Card } from "./ui";
import { supabase } from "@/lib/supabase";
import { useEvents } from "@/lib/data";
import type { MarketEvent } from "@/lib/types";
import { dayMonth, dayMonthYear, tr } from "@/lib/i18n";

const KINDS = () => [
  { id: "sale", label: tr("Sale event", "세일"), hint: tr("Pink Friday, Hot Pink Sale, festive", "Pink Friday, Hot Pink 세일, 명절 세일") },
  { id: "launch", label: tr("Launch", "출시"), hint: tr("a product or range going live", "제품이나 라인 출시") },
  { id: "campaign", label: tr("Campaign", "캠페인"), hint: tr("ads, influencer push, celebrity tie-in", "광고, 인플루언서, 셀럽 협업") },
  { id: "competitor", label: tr("Competitor move", "경쟁사 동향"), hint: tr("something a rival did", "경쟁사가 한 일") },
  { id: "other", label: tr("Other", "기타"), hint: tr("anything else worth marking", "그 밖에 기록할 만한 일") },
];

const KIND_COLOR: Record<string, string> = {
  sale: "#eda100", launch: "#1baf7a", campaign: "#2a78d6", competitor: "#eb6834", other: "#8a8880",
};

/** The owner's log of things that happened in the real world, so a spike has a name next to it. */
export default function EventLog() {
  const { data: events, mutate, isLoading } = useEvents();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);

  return (
    <section id="events" className="mt-12 scroll-mt-32">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">{tr("What was happening", "시장에서 있었던 일")}</h2>
        <p className="text-[13px] text-muted">
          {tr("Sales, launches and campaigns you log here get marked on every chart, so a jump has a reason beside it.", "여기 기록한 세일·출시·캠페인은 모든 차트에 표시 → 급등락 옆에서 이유를 함께 확인.")}
        </p>
        {isAdmin && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand transition hover:opacity-90"
          >
            {open ? tr("Cancel", "취소") : tr("Log an event", "이벤트 기록")}
          </button>
        )}
      </div>

      {open && <EventForm onDone={() => { setOpen(false); mutate(); }} />}

      <Card>
        {isLoading ? (
          <p className="px-5 py-6 text-[13px] text-muted">{tr("Loading events…", "이벤트 불러오는 중…")}</p>
        ) : !events?.length ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] font-medium">{tr("Nothing logged yet", "아직 기록된 이벤트 없음")}</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-muted">
              {isAdmin
                ? tr("Add the next Nykaa sale, an Innisfree campaign, or a rival's launch. The data can show you a spike; only you can say what caused it.", "다음 Nykaa 세일, Innisfree 캠페인, 경쟁사 출시 등을 추가. 데이터는 급등을 보여줄 뿐, 원인은 직접 기록해야 알 수 있음.")
                : tr("The dashboard owner hasn't logged any market events yet.", "대시보드 관리자가 아직 기록한 시장 이벤트 없음.")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => <EventRow key={e.id} e={e} admin={isAdmin} onChange={() => mutate()} />)}
          </ul>
        )}
      </Card>
    </section>
  );
}

function EventRow({ e, admin, onChange }: { e: MarketEvent; admin: boolean; onChange: () => void }) {
  const when = dayMonthYear(e.happened_on);
  // Round 4: past sales entered from deal-site calendars stay "estimated" until the owner confirms them
  const confirm = async () => { const { error } = await supabase().from("market_events").update({ status: "confirmed" }).eq("id", e.id); if (!error) onChange(); };
  const until = e.ends_on ? dayMonth(e.ends_on) : null;
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }} />
      <span className="w-[150px] shrink-0 text-[12.5px] tabular-nums text-muted">
        {when}{until ? ` – ${until}` : ""}
      </span>
      <span className="text-[13.5px] font-medium">{tx(e.label)}</span>
      {e.brand && <span className="text-[12.5px] text-ink-2">{e.brand}</span>}
      {e.status === "estimated" && <span className="rounded bg-[#fbeee4] px-1.5 py-px text-[10.5px] font-semibold uppercase text-[#a8521c]">{tr("estimated", "추정")}</span>}
      {e.source === "homepage" && <span className="rounded bg-sunken px-1.5 py-px text-[10.5px] font-semibold uppercase text-muted">{tr("from Nykaa's homepage", "Nykaa 홈페이지")}</span>}
      {admin && e.status === "estimated" && <button onClick={confirm} className="text-[12px] font-medium text-accent-strong underline underline-offset-2">{tr("Confirm dates", "날짜 확인")}</button>}
      {e.note && <span className="w-full pl-[166px] text-[12.5px] text-muted">{tx(e.note)}</span>}
    </li>
  );
}

function EventForm({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const [form, setForm] = useState({
    happened_on: new Date().toISOString().slice(0, 10),
    ends_on: "",
    label: "",
    kind: "sale",
    brand: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = form.label.trim().length > 1 && !!form.happened_on;
  const hint = useMemo(() => KINDS().find((k) => k.id === form.kind)?.hint, [form.kind]);

  async function save() {
    setBusy(true); setError(null);
    const { error } = await supabase().from("market_events").insert({
      happened_on: form.happened_on,
      ends_on: form.ends_on || null,
      label: form.label.trim(),
      kind: form.kind,
      brand: form.brand.trim() || null,
      note: form.note.trim() || null,
      created_by: session?.user.email ?? null,
    });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  const field = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-muted";
  return (
    <Card className="mb-3">
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("What happened", "내용")}</span>
          <input id="ev-label" className={field} placeholder={tr("Nykaa Pink Friday sale", "Nykaa Pink Friday 세일")} value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("Kind", "유형")} — {hint}</span>
          <select id="ev-kind" className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS().map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("Started", "시작일")}</span>
          <input id="ev-from" type="date" className={field} value={form.happened_on}
            onChange={(e) => setForm({ ...form, happened_on: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("Ended (leave blank for a single day)", "종료일 (하루짜리면 비워 두기)")}</span>
          <input id="ev-to" type="date" className={field} value={form.ends_on}
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("Brand it concerns (optional)", "관련 브랜드 (선택)")}</span>
          <input id="ev-brand" className={field} placeholder="Innisfree" value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">{tr("Note (optional)", "메모 (선택)")}</span>
          <input id="ev-note" className={field} placeholder={tr("40% off sitewide, app only", "전 품목 40% 할인, 앱 전용")} value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        <button onClick={save} disabled={!valid || busy}
          className="rounded-lg bg-brand px-4 py-2 text-[13.5px] font-medium text-on-brand transition hover:opacity-90 disabled:opacity-40">
          {busy ? tr("Saving…", "저장 중…") : tr("Save event", "이벤트 저장")}
        </button>
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
        {!valid && !error && <span className="text-[12.5px] text-muted">{tr("Give it a name and a date.", "이름과 날짜 입력 필요.")}</span>}
      </div>
    </Card>
  );
}

/** Events that fall inside a chart's date window, ready to draw as markers. */
export function eventsInWindow(events: MarketEvent[] | undefined, days: string[]) {
  if (!events?.length || days.length === 0) return [];
  const first = days[0], last = days[days.length - 1];
  return events
    .filter((e) => e.happened_on <= last && (e.ends_on ?? e.happened_on) >= first)
    .map((e) => ({ ...e, color: KIND_COLOR[e.kind] ?? KIND_COLOR.other }));
}
