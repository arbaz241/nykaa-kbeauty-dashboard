"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { requireLogin } from "@/lib/access";
import { isKo, tr } from "@/lib/i18n";

/** Admin › People, top: who may open the site, and who has (owner, 18 Oct 2026: "open to other people without
 *  creating an account... track who has opened and when through their IP address... only available to me").
 *  The switch is app_settings.require_login (migration 029); visits carry the IP address and browser the request
 *  came from, and only admins can read them. */

interface Visitor { visitor: string; who: string; guest: boolean; ips: string | null; first_at: string; last_at: string; visits: number; pages: number; last_page: string | null; user_agent: string | null }
interface Visit { at: string; who: string; guest: boolean; ip: string | null; visitor: string | null; path: string; user_agent: string | null; referrer: string | null }

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const IST = { timeZone: "Asia/Kolkata" } as const;
const when = (s: string) => new Date(s).toLocaleString(isKo() ? "ko-KR" : "en-IN", { ...IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
/** "Chrome on Windows" from a user-agent string, enough to tell devices apart. */
function device(ua: string | null) {
  if (!ua) return "–";
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua.split(/[ /]/)[0];
  const o = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return o ? tr(`${b} on ${o}`, `${o} ${b}`) : b;
}

export default function Access() {
  const setting = useSWR("require_login", requireLogin, { revalidateOnFocus: false });
  const [days, setDays] = useState(7);
  const visitors = useSWR(["admin_visitors", days], () => rpc<Visitor[]>("admin_visitors", { p_days: days }), { revalidateOnFocus: false });
  const log = useSWR(["admin_visit_log", days], () => rpc<Visit[]>("admin_visit_log", { p_days: days, p_limit: 300 }), { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const required = setting.data;

  async function flip(on: boolean) {
    setBusy(true); setErr(null);
    try { await rpc("set_require_login", { p_on: on }); await setting.mutate(); setConfirm(false); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const vs = visitors.data ?? [];
  const guests = vs.filter((v) => v.guest).length;
  const ips = new Set(vs.flatMap((v) => (v.ips ?? "").split(", ").filter(Boolean))).size;
  return (
    <section className="mt-8">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-[720px]">
            <div className="text-[15px] font-semibold">{required === undefined ? tr("Access", "접근") : required ? tr("Sign-in is required", "로그인 필요") : tr("Open: anyone with the link can use the site", "공개: 링크가 있으면 누구나 사용 가능")}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{required
              ? tr("Visitors need an account. Turning it open lets anyone with the link in as a guest, with no account.", "방문자는 계정 필요. 공개로 바꾸면 링크가 있는 누구나 계정 없이 게스트로 접속.")
              : tr("Visitors come in as guests without an account; each visit records the IP address, browser and page, seen only here. Admins still sign in to edit. Requiring sign-in ends every guest session at once.", "방문자는 계정 없이 게스트로 접속. 방문마다 IP 주소·브라우저·페이지가 기록되고 여기서만 확인 가능. 편집은 관리자 로그인 필요. 로그인 필수로 바꾸면 모든 게스트 세션 즉시 종료.")}</p>
          </div>
          {required !== undefined && (required
            ? <button disabled={busy} onClick={() => flip(false)} className="rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-on-brand disabled:opacity-50">{tr("Open the site to guests", "게스트에게 공개")}</button>
            : confirm
              ? <span className="flex items-center gap-2"><button disabled={busy} onClick={() => flip(true)} className="rounded-full bg-bad px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{tr("Yes, require sign-in", "네, 로그인 필수로")}</button><button onClick={() => setConfirm(false)} className="rounded-full px-3 py-2 text-[13px] ring-1 ring-line">{tr("Cancel", "취소")}</button></span>
              : <button onClick={() => setConfirm(true)} className="rounded-full px-4 py-2 text-[13px] font-medium ring-1 ring-line hover:bg-sunken">{tr("Require sign-in", "로그인 필수로 전환")}</button>)}
        </div>
        {err && <p className="mt-2 text-[13px] text-bad">{err}</p>}
      </Card>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[19px] font-semibold">{tr("Who opened the site", "사이트를 연 사람")}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{tr(`${vs.length} browser${vs.length === 1 ? "" : "s"} (${guests} as guests) from ${ips} IP address${ips === 1 ? "" : "es"} in the last ${days} days. One row per browser; times in India time.`, `최근 ${days}일 브라우저 ${vs.length}개(게스트 ${guests}), IP 주소 ${ips}개. 브라우저당 한 줄, 인도 시간.`)}</p>
        </div>
        <div className="flex gap-1.5">{[7, 30, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1 text-[12.5px] ${days === d ? "bg-brand text-on-brand" : "ring-1 ring-line hover:bg-sunken"}`}>{tr(`${d} days`, `${d}일`)}</button>)}</div>
      </div>
      <Card className="mt-3 overflow-x-auto">
        {visitors.error ? <p className="px-5 py-4 text-[13px] text-bad">{(visitors.error as Error).message}</p> : !visitors.data ? <p className="px-5 py-4 text-[13px] text-muted">{tr("Loading…", "불러오는 중…")}</p> : !vs.length ? <p className="px-5 py-4 text-[13px] text-muted">{tr("No visits in this period.", "이 기간 방문 없음.")}</p> : (
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Who", "누구")}</th><th className="px-2">{tr("IP address", "IP 주소")}</th><th className="px-2">{tr("Device", "기기")}</th><th className="px-2">{tr("First visit", "첫 방문")}</th><th className="px-2">{tr("Last visit", "마지막 방문")}</th><th className="px-2 text-right">{tr("Pages opened", "열람 페이지")}</th><th className="px-2 pr-4">{tr("Last page", "마지막 페이지")}</th></tr></thead>
            <tbody>{vs.map((v) => (
              <tr key={v.visitor} className="border-b border-line/60 align-top last:border-0">
                <td className="px-4 py-2">{v.guest ? <span className="text-ink-2">{tr("Guest", "게스트")} <span className="text-[11px] text-muted">{v.visitor.slice(0, 8)}</span></span> : <b className="font-medium">{v.who}</b>}</td>
                <td className="px-2 py-2 tabular">{v.ips ?? "–"}</td>
                <td className="px-2 py-2 text-ink-2">{device(v.user_agent)}</td>
                <td className="whitespace-nowrap px-2 py-2 text-ink-2">{when(v.first_at)}</td>
                <td className="whitespace-nowrap px-2 py-2">{when(v.last_at)}</td>
                <td className="px-2 py-2 text-right tabular">{v.visits}<span className="text-muted"> · {tr(`${v.pages} different`, `${v.pages}종`)}</span></td>
                <td className="max-w-[260px] truncate px-2 py-2 pr-4 text-ink-2">{v.last_page ?? "–"}</td>
              </tr>))}</tbody>
          </table>)}
      </Card>
      <details className="mt-3 rounded-[14px] bg-surface px-5 py-3 ring-1 ring-line">
        <summary className="cursor-pointer text-[13px] font-medium">{tr("Every visit, newest first", "모든 방문, 최신순")}</summary>
        <div className="mt-2 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[820px] text-[12.5px]">
            <tbody>{(log.data ?? []).map((v, i) => (
              <tr key={i} className="border-b border-line/50"><td className="whitespace-nowrap py-1.5 pr-3 text-ink-2">{when(v.at)}</td><td className="pr-3">{v.guest ? tr("Guest", "게스트") : v.who}</td><td className="pr-3 tabular">{v.ip ?? "–"}</td><td className="pr-3 text-ink-2">{device(v.user_agent)}</td><td className="max-w-[300px] truncate pr-3">{v.path}</td><td className="max-w-[200px] truncate text-muted">{v.referrer ?? ""}</td></tr>))}</tbody>
          </table>
        </div>
      </details>
      <p className="mt-2 text-[12px] text-muted">{tr("An IP address shows the network, not the person: people on one office or mobile network can share one, and a VPN hides it. The browser id tells one browser from another on the same network.", "IP 주소는 사람이 아니라 네트워크 기준. 같은 사무실·모바일 네트워크 사용자는 IP를 공유할 수 있고, VPN은 IP를 숨김. 브라우저 ID로 같은 네트워크의 다른 브라우저 구분.")}</p>
    </section>
  );
}
