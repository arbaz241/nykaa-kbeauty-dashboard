"use client";

import { setLang, useLang, type Lang } from "@/lib/i18n";

const OPTIONS: { value: Lang; label: string; aria: string }[] = [
  { value: "en", label: "EN", aria: "English" },
  { value: "ko", label: "한국어", aria: "한국어 (Korean)" },
];

/** EN | 한국어 switch for the header and the sign-in page. The choice is kept in this browser. */
export default function LangToggle({ className = "" }: { className?: string }) {
  const cur = useLang();
  return (
    <div role="group" aria-label="Language / 언어" className={`inline-flex shrink-0 rounded-full bg-sunken p-0.5 ring-1 ring-line ${className}`}>
      {OPTIONS.map((o) => (
        <button key={o.value} type="button" aria-label={o.aria} aria-pressed={cur === o.value} onClick={() => setLang(o.value)}
          className={`press whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] leading-none transition ${cur === o.value ? "bg-surface font-semibold text-ink shadow-card ring-1 ring-line" : "font-medium text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
