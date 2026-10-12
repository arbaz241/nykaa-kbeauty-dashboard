"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const TITLE = { in: "Sign in", up: "Create account", forgot: "Reset password", reset: "Choose a new password" };
const ACTION = { in: "Sign in", up: "Create account", forgot: "Email me a reset link", reset: "Save and sign in" };

export default function Login() {
  // forgot: ask for a reset email; reset: arrived from that email's link, choose a new password
  const [mode, setMode] = useState<"in" | "up" | "forgot" | "reset">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
      setMsg(error ? { kind: "err", text: error.message } : { kind: "ok", text: "If that email has an account, a reset link is on its way. Open it on this device." });
      return;
    }
    if (mode === "reset") {
      const { error } = await auth.updateUser({ password: pw });
      setBusy(false);
      if (error) setMsg({ kind: "err", text: error.message }); else window.location.replace("/compare/");
      return;
    }
    const res = mode === "in" ? await auth.signInWithPassword({ email, password: pw }) : await auth.signUp({ email, password: pw });
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      setMsg({ kind: "err", text: /Invalid login/i.test(m) ? "Invalid email or password." : /not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you."
        : /banned/i.test(m) ? "This account has been blocked. Contact the admin."
        : mode === "up" && /database error/i.test(m) ? "New sign-ups are closed. Ask the admin to invite your email." : m });
    } else if (res.data.session) window.location.replace("/compare/");
    else setMsg({ kind: "ok", text: "Account created. Check your inbox for the confirmation link, then sign in." });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink font-display text-[14px] font-bold leading-none text-white">N</span>
          <span className="font-display text-[15px] font-semibold tracking-tight">Nykaa Market Intelligence</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{TITLE[mode]}</h1>
        <p className="mt-2 text-sm text-ink-2">Brand and product intelligence for beauty on Nykaa India.</p>
        <form onSubmit={submit} className="mt-8 space-y-3">
          {mode !== "reset" && (
            <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-ink" />
          )}
          {mode !== "forgot" && (
            <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder={mode === "reset" ? "New password (8+ characters)" : "Password"} value={pw} onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-ink" />
          )}
          <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-3 text-[15px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : ACTION[mode]}
          </button>
        </form>
        {msg && <p className={`mt-4 text-sm ${msg.kind === "err" ? "text-bad" : "text-good"}`}>{msg.text}</p>}
        {mode !== "reset" && (
          <div className="mt-6 flex justify-between text-sm text-ink-2">
            <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="underline-offset-4 hover:underline">
              {mode === "in" ? "No account? Create one" : "Back to sign in"}
            </button>
            {mode === "in" && (
              <button onClick={() => { setMode("forgot"); setMsg(null); }} className="underline-offset-4 hover:underline">Forgot password?</button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
