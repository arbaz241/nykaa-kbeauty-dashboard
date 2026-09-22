"use client";

export default function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-sunken p-1 ring-1 ring-line">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`rounded-[10px] px-4 py-2 text-left transition ${value === o.value ? "bg-surface shadow-card ring-1 ring-line" : "hover:bg-surface/60"}`}>
          <div className={`text-[13.5px] ${value === o.value ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>{o.label}</div>
          {o.hint && <div className="text-[11.5px] text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  );
}
