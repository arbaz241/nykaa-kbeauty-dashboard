"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSession } from "@/components/AuthGate";
import { Card, Loading, Stat } from "@/components/ui";
import { supabase } from "@/lib/supabase";

interface Person {
  id: string; email: string; joined_at: string; confirmed: boolean; last_sign_in_at: string | null; last_active_at: string | null;
  blocked: boolean; is_admin: boolean; visits_30d: number; last_page: string | null;
}
interface Visit { at: string; email: string; path: string }
interface Settings { signup_open: boolean; invites: { email: string; added_at: string }[] }

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const IST = { timeZone: "Asia/Kolkata" } as const;
const day = (s: string) => new Date(s).toLocaleDateString("en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });
const time = (s: string) => new Date(s).toLocaleTimeString("en-IN", { ...IST, hour: "numeric", minute: "2-digit" });
function ago(s: string | null) {
  if (!s) return "never";
  const m = (Date.now() - new Date(s).getTime()) / 60000;
  if (m < 2) return "just now"; if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`; if (m < 60 * 24 * 30) return `${Math.round(m / 1440)} days ago`;
  return day(s);
}
const PAGE: Record<string, string> = {
  "/analysis/": "Analysis", "/compare/": "Competitive Analysis", "/demand/": "Demand", "/market/": "Market", "/categories/": "Top by category", "/admin/": "Admin",
};
const pageName = (p: string | null) => (p ? PAGE[p] ?? p : "–");

/** Admin › People: every account, when it joined, its id and activity, and the controls over access. */
export default function People() {
  const me = useSession()?.user;
  const people = useSWR("admin_users", () => rpc<Person[]>("admin_users"), { revalidateOnFocus: false });
  const visits = useSWR("admin_visits", () => rpc<Visit[]>("admin_visits", { p_limit: 150 }), { revalidateOnFocus: false });
  const settings = useSWR("admin_settings", async () => (await rpc<Settings[]>("admin_settings"))[0], { revalidateOnFocus: false });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [invite, setInvite] = useState("");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [week] = useState(() => Date.now() - 7 * 864e5);

  async function act(key: string, fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(key); setMsg(null);
    try { await rpc(fn, args); setMsg({ kind: "ok", text: ok }); await Promise.all([people.mutate(), settings.mutate()]); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy(null); setConfirmDelete(null);
  }

  const err = people.error ?? settings.error;
  if (err) return <p className="mt-8 text-[14px] text-bad">Could not load accounts: {(err as Error).message}</p>;
  if (!people.data || !settings.data) return <Loading what="accounts" />;

  const all = people.data;
  const list = all.filter((p) => !q || p.email.toLowerCase().includes(q.toLowerCase()) || p.id.startsWith(q.toLowerCase()));
  const s = settings.data;

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={String(all.length)} label="Accounts" sub={`${all.filter((p) => !p.confirmed).length} not yet confirmed by email`} />
        <Stat value={String(all.filter((p) => +new Date(p.joined_at) > week).length)} label="Joined in the last 7 days" />
        <Stat value={String(all.filter((p) => p.last_active_at && +new Date(p.last_active_at) > week).length)} label="Active in the last 7 days" />
        <Stat value={String(all.filter((p) => p.is_admin).length)} label="Admins" sub={`${all.filter((p) => p.blocked).length} blocked`} />
      </div>

      {msg && <p className={`mt-4 text-[13px] ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      <Card className="mt-4 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold">New sign-ups are {s.signup_open ? "open" : "closed"}</div>
            <p className="mt-0.5 max-w-[640px] text-[12.5px] text-ink-2">
              {s.signup_open ? "Anyone with the link can create an account and see the dashboard." : "Only the invited emails below (and admins) can create an account. Existing accounts are not affected."}
            </p>
          </div>
          <button disabled={busy === "signup"} onClick={() => act("signup", "admin_set_signup", { p_open: !s.signup_open }, s.signup_open ? "Sign-ups closed." : "Sign-ups opened.")}
            className={`rounded-xl px-4 py-2 text-[13px] font-medium disabled:opacity-40 ${s.signup_open ? "bg-ink text-white" : "ring-1 ring-line text-ink"}`}>
            {s.signup_open ? "Close sign-ups" : "Open sign-ups"}
          </button>
        </div>
        {!s.signup_open && (
          <div className="mt-4 border-t border-line pt-4">
            <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (invite.includes("@")) { act("invite", "admin_set_invite", { p_email: invite, p_on: true }, `${invite} can now create an account.`); setInvite(""); } }}>
              <input type="email" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Invite an email" className="w-64 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] outline-none focus:border-ink" />
              <button disabled={!invite.includes("@") || busy === "invite"} className="rounded-xl bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40">Invite</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {s.invites.length === 0 && <span className="text-[12.5px] text-muted">No invites yet.</span>}
              {s.invites.map((i) => (
                <span key={i.email} className="flex items-center gap-2 rounded-full bg-sunken px-3 py-1 text-[12.5px]">
                  {i.email}
                  <button title="Remove invite" onClick={() => act("invite", "admin_set_invite", { p_email: i.email, p_on: false }, `Invite for ${i.email} removed.`)} className="text-muted hover:text-bad">×</button>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold tracking-tight">Accounts</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or id" className="w-56 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] outline-none focus:border-ink" />
      </div>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-3">Account</th><th className="px-3 py-3">Account id</th><th className="px-3 py-3">Joined (IST)</th>
            <th className="px-3 py-3">Last active</th><th className="px-3 py-3 text-right">Pages opened (30 days)</th><th className="px-3 py-3">Last page</th><th className="px-4 py-3 text-right">Controls</th>
          </tr></thead>
          <tbody>
            {list.map((p) => {
              const self = p.id === me?.id;
              return (
                <tr key={p.id} className={`border-b border-line/70 align-top ${p.blocked ? "bg-[#fdf3ef]" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]">
                      {self && <span className="rounded bg-sunken px-1.5 py-0.5 text-ink-2">you</span>}
                      {p.is_admin && <span className="rounded bg-ink px-1.5 py-0.5 text-white">admin</span>}
                      {p.blocked && <span className="rounded bg-bad px-1.5 py-0.5 text-white">blocked</span>}
                      {!p.confirmed && <span className="rounded bg-[#fff4d6] px-1.5 py-0.5 text-[#8a5a00]">email not confirmed</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button title={`${p.id} (click to copy)`} onClick={() => { navigator.clipboard?.writeText(p.id); setCopied(p.id); setTimeout(() => setCopied(null), 1500); }}
                      className="font-mono text-[12px] text-ink-2 hover:text-ink">{copied === p.id ? "copied" : `${p.id.slice(0, 8)}…`}</button>
                  </td>
                  <td className="px-3 py-2.5 tabular">{day(p.joined_at)}<div className="text-[11.5px] text-muted">{time(p.joined_at)}</div></td>
                  <td className="px-3 py-2.5">{ago(p.last_active_at)}{p.last_sign_in_at && <div className="text-[11.5px] text-muted">last sign-in {day(p.last_sign_in_at)}</div>}</td>
                  <td className="px-3 py-2.5 text-right tabular">{p.visits_30d}</td>
                  <td className="px-3 py-2.5 text-ink-2">{pageName(p.last_page)}</td>
                  <td className="px-4 py-2">
                    {self ? <div className="text-right text-[12px] text-muted">–</div> : (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button disabled={!!busy} onClick={() => act(p.id, "admin_set_admin", { p_email: p.email, p_on: !p.is_admin }, p.is_admin ? `${p.email} is no longer an admin.` : `${p.email} is now an admin.`)}
                          className="rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-line hover:bg-sunken disabled:opacity-40">{p.is_admin ? "Remove admin" : "Make admin"}</button>
                        <button disabled={!!busy} onClick={() => act(p.id, "admin_set_blocked", { p_user: p.id, p_on: !p.blocked }, p.blocked ? `${p.email} can sign in again.` : `${p.email} is blocked and signed out.`)}
                          className="rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-line hover:bg-sunken disabled:opacity-40">{p.blocked ? "Unblock" : "Block"}</button>
                        {confirmDelete === p.id ? (
                          <>
                            <button disabled={!!busy} onClick={() => act(p.id, "admin_delete_user", { p_user: p.id }, `${p.email} was deleted.`)} className="rounded-lg bg-bad px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40">Delete for good</button>
                            <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-2.5 py-1 text-[12px] text-ink-2">Cancel</button>
                          </>
                        ) : (
                          <button disabled={!!busy} onClick={() => setConfirmDelete(p.id)} className="rounded-lg px-2.5 py-1 text-[12px] text-bad ring-1 ring-line hover:bg-[#fdf3ef] disabled:opacity-40">Delete</button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-[12px] text-muted">
        Block: the account cannot sign in again, and any page it already has open stops working within an hour. Delete: removes the account; the email could sign up again unless sign-ups are closed.
        Page counts start from the day this admin view went live.
      </p>

      <h2 className="mt-10 font-display text-[20px] font-semibold tracking-tight">Recent activity</h2>
      <Card className="mt-3 max-h-[420px] overflow-auto">
        {!visits.data ? <div className="px-5 py-4 text-[13px] text-muted">Loading…</div> : visits.data.length === 0 ? <div className="px-5 py-4 text-[13px] text-muted">No page visits recorded yet.</div> : (
          <table className="w-full text-[13px]">
            <tbody>
              {visits.data.map((v, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className="whitespace-nowrap px-4 py-2 tabular text-ink-2">{day(v.at)}, {time(v.at)}</td>
                  <td className="px-3 py-2 font-medium">{v.email}</td>
                  <td className="px-4 py-2 text-ink-2">opened {pageName(v.path)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
