"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSession } from "@/components/AuthGate";
import { Card, Loading, Stat } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { isKo, tr } from "@/lib/i18n";

interface Person {
  id: string; email: string; joined_at: string; confirmed: boolean; last_sign_in_at: string | null; last_active_at: string | null;
  blocked: boolean; is_admin: boolean; visits_30d: number; last_page: string | null;
}
interface Visit { at: string; email: string; path: string }

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const IST = { timeZone: "Asia/Kolkata" } as const;
// dates in India time, read in the site's language
const day = (s: string) => new Date(s).toLocaleDateString(isKo() ? "ko-KR" : "en-IN", { ...IST, day: "numeric", month: "short", year: "numeric" });
const time = (s: string) => new Date(s).toLocaleTimeString(isKo() ? "ko-KR" : "en-IN", { ...IST, hour: "numeric", minute: "2-digit" });
function ago(s: string | null) {
  if (!s) return tr("never", "없음");
  const m = (Date.now() - new Date(s).getTime()) / 60000;
  if (m < 2) return tr("just now", "방금 전"); if (m < 60) return tr(`${Math.round(m)} min ago`, `${Math.round(m)}분 전`);
  if (m < 60 * 24) return tr(`${Math.round(m / 60)} h ago`, `${Math.round(m / 60)}시간 전`); if (m < 60 * 24 * 30) return tr(`${Math.round(m / 1440)} days ago`, `${Math.round(m / 1440)}일 전`);
  return day(s);
}
const PAGE = (): Record<string, string> => ({
  "/analysis/": tr("Analysis", "분석"), "/compare/": tr("Competitive Analysis", "경쟁 분석"), "/demand/": tr("Demand", "수요"), "/market/": tr("Market", "시장"), "/categories/": tr("Top by category", "카테고리별 순위"), "/admin/": tr("Admin", "관리"),
});
const pageName = (p: string | null) => (p ? PAGE()[p] ?? p : "–");

/** Admin › People: every account, when it joined, its id and activity, and the controls over access. */
export default function People() {
  const me = useSession()?.user;
  const people = useSWR("admin_users", () => rpc<Person[]>("admin_users"), { revalidateOnFocus: false });
  const visits = useSWR("admin_visits", () => rpc<Visit[]>("admin_visits", { p_limit: 150 }), { revalidateOnFocus: false });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [week] = useState(() => Date.now() - 7 * 864e5);

  async function act(key: string, fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(key); setMsg(null);
    try { await rpc(fn, args); setMsg({ kind: "ok", text: ok }); await people.mutate(); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy(null); setConfirmDelete(null);
  }

  const err = people.error;
  if (err) return <p className="mt-8 text-[14px] text-bad">{tr("Could not load accounts", "계정을 불러오지 못했습니다")}: {(err as Error).message}</p>;
  if (!people.data) return <Loading what={tr("accounts", "계정")} />;

  const all = people.data;
  const list = all.filter((p) => !q || p.email.toLowerCase().includes(q.toLowerCase()) || p.id.startsWith(q.toLowerCase()));

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={String(all.length)} label={tr("Accounts", "계정")} sub={tr(`${all.filter((p) => !p.confirmed).length} not yet confirmed by email`, `이메일 미인증 ${all.filter((p) => !p.confirmed).length}명`)} />
        <Stat value={String(all.filter((p) => +new Date(p.joined_at) > week).length)} label={tr("Joined in the last 7 days", "최근 7일 가입")} />
        <Stat value={String(all.filter((p) => p.last_active_at && +new Date(p.last_active_at) > week).length)} label={tr("Active in the last 7 days", "최근 7일 활동")} />
        <Stat value={String(all.filter((p) => p.is_admin).length)} label={tr("Admins", "관리자")} sub={tr(`${all.filter((p) => p.blocked).length} blocked`, `차단 ${all.filter((p) => p.blocked).length}명`)} />
      </div>

      {msg && <p className={`mt-4 text-[13px] ${msg.kind === "ok" ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[20px] font-semibold tracking-tight">{tr("Accounts", "계정")}</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search email or id", "이메일 또는 ID 검색")} className="w-56 rounded-xl border border-line bg-surface px-3.5 py-2 text-[13px] outline-none focus:border-accent-strong" />
      </div>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-3">{tr("Account", "계정")}</th><th className="px-3 py-3">{tr("Account id", "계정 ID")}</th><th className="px-3 py-3">{tr("Joined (IST)", "가입 (인도 시간)")}</th>
            <th className="px-3 py-3">{tr("Last active", "최근 활동")}</th><th className="px-3 py-3 text-right">{tr("Pages opened (30 days)", "열어 본 페이지 (30일)")}</th><th className="px-3 py-3">{tr("Last page", "마지막 페이지")}</th><th className="px-4 py-3 text-right">{tr("Controls", "관리")}</th>
          </tr></thead>
          <tbody>
            {list.map((p) => {
              const self = p.id === me?.id;
              return (
                <tr key={p.id} className={`border-b border-line/70 align-top ${p.blocked ? "bg-[#fdf3ef]" : ""}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.email}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]">
                      {self && <span className="rounded bg-sunken px-1.5 py-0.5 text-ink-2">{tr("you", "나")}</span>}
                      {p.is_admin && <span className="rounded bg-brand px-1.5 py-0.5 text-on-brand">{tr("admin", "관리자")}</span>}
                      {p.blocked && <span className="rounded bg-bad px-1.5 py-0.5 text-white">{tr("blocked", "차단됨")}</span>}
                      {!p.confirmed && <span className="rounded bg-[#fff4d6] px-1.5 py-0.5 text-[#8a5a00]">{tr("email not confirmed", "이메일 미인증")}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button title={tr(`${p.id} (click to copy)`, `${p.id} (눌러서 복사)`)} onClick={() => { navigator.clipboard?.writeText(p.id); setCopied(p.id); setTimeout(() => setCopied(null), 1500); }}
                      className="font-mono text-[12px] text-ink-2 hover:text-ink">{copied === p.id ? tr("copied", "복사됨") : `${p.id.slice(0, 8)}…`}</button>
                  </td>
                  <td className="px-3 py-2.5 tabular">{day(p.joined_at)}<div className="text-[11.5px] text-muted">{time(p.joined_at)}</div></td>
                  <td className="px-3 py-2.5">{ago(p.last_active_at)}{p.last_sign_in_at && <div className="text-[11.5px] text-muted">{tr("last sign-in", "마지막 로그인")} {day(p.last_sign_in_at)}</div>}</td>
                  <td className="px-3 py-2.5 text-right tabular">{p.visits_30d}</td>
                  <td className="px-3 py-2.5 text-ink-2">{pageName(p.last_page)}</td>
                  <td className="px-4 py-2">
                    {self ? <div className="text-right text-[12px] text-muted">–</div> : (
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button disabled={!!busy} onClick={() => act(p.id, "admin_set_admin", { p_email: p.email, p_on: !p.is_admin }, p.is_admin ? tr(`${p.email} is no longer an admin.`, `${p.email}의 관리자 권한을 해제했습니다.`) : tr(`${p.email} is now an admin.`, `${p.email}을(를) 관리자로 지정했습니다.`))}
                          className="rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-line hover:bg-sunken disabled:opacity-40">{p.is_admin ? tr("Remove admin", "관리자 해제") : tr("Make admin", "관리자 지정")}</button>
                        <button disabled={!!busy} onClick={() => act(p.id, "admin_set_blocked", { p_user: p.id, p_on: !p.blocked }, p.blocked ? tr(`${p.email} can sign in again.`, `${p.email}은(는) 다시 로그인할 수 있습니다.`) : tr(`${p.email} is blocked and signed out.`, `${p.email}을(를) 차단하고 로그아웃시켰습니다.`))}
                          className="rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-line hover:bg-sunken disabled:opacity-40">{p.blocked ? tr("Unblock", "차단 해제") : tr("Block", "차단")}</button>
                        {confirmDelete === p.id ? (
                          <>
                            <button disabled={!!busy} onClick={() => act(p.id, "admin_delete_user", { p_user: p.id }, tr(`${p.email} was deleted.`, `${p.email}을(를) 삭제했습니다.`))} className="rounded-lg bg-bad px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40">{tr("Delete for good", "영구 삭제")}</button>
                            <button onClick={() => setConfirmDelete(null)} className="rounded-lg px-2.5 py-1 text-[12px] text-ink-2">{tr("Cancel", "취소")}</button>
                          </>
                        ) : (
                          <button disabled={!!busy} onClick={() => setConfirmDelete(p.id)} className="rounded-lg px-2.5 py-1 text-[12px] text-bad ring-1 ring-line hover:bg-[#fdf3ef] disabled:opacity-40">{tr("Delete", "삭제")}</button>
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
        {tr("Block: the account cannot sign in again, and any page it already has open stops working within an hour. Delete: removes the account; the same email could sign up again later. Page counts start from the day this admin view went live.",
          "차단: 다시 로그인할 수 없고, 이미 열려 있는 페이지도 1시간 안에 작동을 멈춥니다. 삭제: 계정을 없애며, 같은 이메일로 나중에 다시 가입할 수 있습니다. 페이지 수는 이 관리 화면이 생긴 날부터 셉니다.")}
      </p>

      <h2 className="mt-10 font-display text-[20px] font-semibold tracking-tight">{tr("Recent activity", "최근 활동")}</h2>
      <Card className="mt-3 max-h-[420px] overflow-auto">
        {!visits.data ? <div className="px-5 py-4 text-[13px] text-muted">{tr("Loading…", "불러오는 중…")}</div> : visits.data.length === 0 ? <div className="px-5 py-4 text-[13px] text-muted">{tr("No page visits recorded yet.", "아직 기록된 방문이 없습니다.")}</div> : (
          <table className="w-full text-[13px]">
            <tbody>
              {visits.data.map((v, i) => (
                <tr key={i} className="border-b border-line/70">
                  <td className="whitespace-nowrap px-4 py-2 tabular text-ink-2">{day(v.at)}, {time(v.at)}</td>
                  <td className="px-3 py-2 font-medium">{v.email}</td>
                  <td className="px-4 py-2 text-ink-2">{tr(`opened ${pageName(v.path)}`, `${pageName(v.path)} 열람`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
