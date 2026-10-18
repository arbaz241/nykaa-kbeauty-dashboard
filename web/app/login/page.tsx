"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { guestsAllowed } from "@/lib/access";
import { loadLang, tr, useLang } from "@/lib/i18n";
import LangToggle from "@/components/LangToggle";

const TITLE = () => ({ in: tr("Sign in", "로그인"), up: tr("Create account", "계정 만들기"), forgot: tr("Reset password", "비밀번호 재설정"), reset: tr("Choose a new password", "새 비밀번호 설정") });
const ACTION = () => ({ in: tr("Sign in", "로그인"), up: tr("Create account", "계정 만들기"), forgot: tr("Email me a reset link", "재설정 링크 받기"), reset: tr("Save and sign in", "저장하고 로그인") });

export default function Login() {
  useLang(); // re-render on a language change (nothing here is memoised, so no remount is needed)
  useEffect(loadLang, []);
  // forgot: ask for a reset email; reset: arrived from that email's link, choose a new password
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // while the site is open (lib/access), anyone can go in without an account
  const [open, setOpen] = useState(false);
  useEffect(() => { guestsAllowed().then(setOpen, () => {}); }, []);
  useEffect(() => {
    // the client reads the reset link's token from the URL and announces it as PASSWORD_RECOVERY
    const { data: sub } = supabase().auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setMode("reset"); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const auth = supabase().auth;
    if (mode === "forgot") {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login/` });
      setBusy(false);
      setMsg(error ? { kind: "err", text: error.message } : { kind: "ok", text: tr("If that email has an account, a reset link is on its way. Open it on this device.", "가입된 이메일이라면 재설정 링크가 발송됩니다. 이 기기에서 링크를 열어 주세요.") });
      return;
    }
    if (mode === "reset") {
      const { error } = await auth.updateUser({ password: pw });
      setBusy(false);
      if (error) setMsg({ kind: "err", text: error.message }); else window.location.replace("/overview/");
      return;
    }
    const res = mode === "in" ? await auth.signInWithPassword({ email, password: pw }) : await auth.signUp({ email, password: pw });
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      setMsg({ kind: "err", text: /Invalid login/i.test(m) ? tr("Invalid email or password.", "이메일 또는 비밀번호가 올바르지 않습니다.") : /not confirmed/i.test(m) ? tr("Confirm your email first: open the link we sent you.", "먼저 이메일 인증을 완료해 주세요. 보내 드린 링크를 열면 됩니다.")
        : /banned/i.test(m) ? tr("This account has been blocked. Contact the admin.", "차단된 계정입니다. 관리자에게 문의해 주세요.") : m });
    } else if (res.data.session) window.location.replace("/overview/");
    else setMsg({ kind: "ok", text: tr("Account created. Check your inbox for the confirmation link, then sign in.", "계정이 만들어졌습니다. 받은편지함의 인증 링크를 연 다음 로그인해 주세요.") });
  }

  return (
    <main className="relative grid min-h-screen place-items-center px-4">
      <LangToggle className="absolute right-5 top-5" />
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink font-display text-[14px] font-bold leading-none text-white">N</span>
          <span className="font-display text-[15px] font-semibold tracking-tight">Nykaa Market Intelligence</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{TITLE()[mode]}</h1>
        <p className="mt-2 text-sm text-ink-2">{tr("Brand and product intelligence for beauty on Nykaa India.", "Nykaa 인도 뷰티 시장의 브랜드·제품 인텔리전스")}</p>
        <form onSubmit={submit} className="mt-8 space-y-3">
          {mode !== "reset" && (
            <input type="email" required autoComplete="username" placeholder={tr("Email", "이메일")} value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-accent-strong" />
          )}
          {mode !== "forgot" && (
            <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder={mode === "reset" ? tr("New password (8+ characters)", "새 비밀번호 (8자 이상)") : tr("Password", "비밀번호")} value={pw} onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-accent-strong" />
          )}
          <button disabled={busy} className="w-full rounded-xl bg-brand px-4 py-3 text-[15px] font-medium text-on-brand transition hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : ACTION()[mode]}
          </button>
        </form>
        {msg && <p className={`mt-4 text-sm ${msg.kind === "err" ? "text-bad" : "text-good"}`}>{msg.text}</p>}
        {open && mode === "in" && <Link href="/" className="mt-5 block rounded-xl px-4 py-3 text-center text-[15px] font-medium text-accent-strong ring-1 ring-line transition hover:bg-sunken">{tr("Open the dashboard without an account →", "계정 없이 대시보드 열기 →")}</Link>}
        {mode !== "reset" && (
          <div className="mt-6 flex justify-between text-sm text-ink-2">
            <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="underline-offset-4 hover:underline">
              {mode === "in" ? tr("No account? Create one", "계정이 없으신가요? 만들기") : tr("Back to sign in", "로그인으로 돌아가기")}
            </button>
            {mode === "in" && (
              <button onClick={() => { setMode("forgot"); setMsg(null); }} className="underline-offset-4 hover:underline">{tr("Forgot password?", "비밀번호를 잊으셨나요?")}</button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
