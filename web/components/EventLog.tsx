"use client";

import { useMemo, useState } from "react";
import { useIsAdmin, useSession } from "./AuthGate";
import { Card } from "./ui";
import { supabase } from "@/lib/supabase";
import { useEvents } from "@/lib/data";
import type { MarketEvent } from "@/lib/types";

const KINDS = [
  { id: "sale", label: "Sale event", hint: "Pink Friday, Hot Pink Sale, festive" },
  { id: "launch", label: "Launch", hint: "a product or range going live" },
  { id: "campaign", label: "Campaign", hint: "ads, influencer push, celebrity tie-in" },
  { id: "competitor", label: "Competitor move", hint: "something a rival did" },
  { id: "other", label: "Other", hint: "anything else worth marking" },
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
        <h2 className="font-display text-[17px] font-semibold tracking-tight">What was happening</h2>
        <p className="text-[13px] text-muted">
          Sales, launches and campaigns you log here get marked on every chart, so a jump has a reason beside it.
        </p>
        {isAdmin && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-lg bg-ink px-3 py-1.5 text-[13px] font-medium text-page transition hover:opacity-90"
          >
            {open ? "Cancel" : "Log an event"}
          </button>
        )}
      </div>

      {open && <EventForm onDone={() => { setOpen(false); mutate(); }} />}

      <Card>
        {isLoading ? (
          <p className="px-5 py-6 text-[13px] text-muted">Loading events…</p>
        ) : !events?.length ? (
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] font-medium">Nothing logged yet</p>
            <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-muted">
              {isAdmin
                ? "Add the next Nykaa sale, an Innisfree campaign, or a rival's launch. The data can show you a spike; only you can say what caused it."
                : "The dashboard owner hasn't logged any market events yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e) => <EventRow key={e.id} e={e} />)}
          </ul>
        )}
      </Card>
    </section>
  );
}

function EventRow({ e }: { e: MarketEvent }) {
  const when = new Date(e.happened_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const until = e.ends_on ? new Date(e.ends_on).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  return (
    <li className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_COLOR[e.kind] ?? KIND_COLOR.other }} />
      <span className="w-[150px] shrink-0 text-[12.5px] tabular-nums text-muted">
        {when}{until ? ` – ${until}` : ""}
      </span>
      <span className="text-[13.5px] font-medium">{e.label}</span>
      {e.brand && <span className="text-[12.5px] text-ink-2">{e.brand}</span>}
      {e.note && <span className="w-full pl-[166px] text-[12.5px] text-muted">{e.note}</span>}
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
  const hint = useMemo(() => KINDS.find((k) => k.id === form.kind)?.hint, [form.kind]);

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
          <span className="text-[12px] text-muted">What happened</span>
          <input id="ev-label" className={field} placeholder="Nykaa Pink Friday sale" value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">Kind — {hint}</span>
          <select id="ev-kind" className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">Started</span>
          <input id="ev-from" type="date" className={field} value={form.happened_on}
            onChange={(e) => setForm({ ...form, happened_on: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">Ended (leave blank for a single day)</span>
          <input id="ev-to" type="date" className={field} value={form.ends_on}
            onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">Brand it concerns (optional)</span>
          <input id="ev-brand" className={field} placeholder="Innisfree" value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </label>
        <label className="grid gap-1">
          <span className="text-[12px] text-muted">Note (optional)</span>
          <input id="ev-note" className={field} placeholder="40% off sitewide, app only" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        <button onClick={save} disabled={!valid || busy}
          className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-medium text-page transition hover:opacity-90 disabled:opacity-40">
          {busy ? "Saving…" : "Save event"}
        </button>
        {error && <span className="text-[12.5px] text-bad">{error}</span>}
        {!valid && !error && <span className="text-[12.5px] text-muted">Give it a name and a date.</span>}
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
