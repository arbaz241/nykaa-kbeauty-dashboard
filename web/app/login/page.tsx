"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const auth = supabase().auth;
    const res = mode === "in" ? await auth.signInWithPassword({ email, password: pw }) : await auth.signUp({ email, password: pw });
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      setMsg({ kind: "err", text: /Invalid login/i.test(m) ? "Invalid email or password." : /not confirmed/i.test(m) ? "Confirm your email first: open the link we sent you." : m });
    } else if (res.data.session) window.location.replace("/compare/");
    else setMsg({ kind: "ok", text: "Account created. Check your inbox for the confirmation link, then sign in." });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="h-6 w-6 rounded-md bg-ink" />
          <span className="font-display text-[15px] font-semibold tracking-tight">Nykaa Market Intelligence</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{mode === "in" ? "Sign in" : "Create account"}</h1>
        <p className="mt-2 text-sm text-ink-2">Brand and product intelligence for beauty on Nykaa India.</p>
        <form onSubmit={submit} className="mt-8 space-y-3">
          <input type="email" required autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-ink" />
          <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-[15px] outline-none transition focus:border-ink" />
          <button disabled={busy} className="w-full rounded-xl bg-ink px-4 py-3 text-[15px] font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>
        {msg && <p className={`mt-4 text-sm ${msg.kind === "err" ? "text-bad" : "text-good"}`}>{msg.text}</p>}
        <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="mt-6 text-sm text-ink-2 underline-offset-4 hover:underline">
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
