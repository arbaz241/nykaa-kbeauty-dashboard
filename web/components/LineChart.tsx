"use client";

import { useMemo, useRef, useState } from "react";

export interface Series { name: string; color: string; values: (number | null)[] }
/** A real-world event to mark on the timeline: one index, or a span of them. */
export interface Marker { from: number; to?: number; label: string; color: string }

/** Responsive multi-line chart: one y-axis, direct end labels, hover crosshair with a read-out of every series. */
export default function LineChart({ labels, series, height = 260, format = (v: number) => Math.round(v).toLocaleString("en-IN"), invert = false, yLabel, markers = [] }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string; invert?: boolean; yLabel?: string; markers?: Marker[];
}) {
  const W = 1000; const H = height; const L = 48; const R = 150; const T = 18; const B = 28;
  const ref = useRef<SVGSVGElement>(null); const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  // round tick steps (1, 2, 2.5, 5 x 10^n) so axis labels read cleanly
  const { lo, hi, step: tickStep } = useMemo(() => {
    const niceStep = (range: number) => { const raw = range / 4; const e = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9))); const f = raw / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; };
    if (!all.length) return { lo: 0, hi: 4, step: 1 };
    const mx = Math.max(...all); const mn = invert ? Math.min(...all) : 0;
    if (invert) { const st = Math.max(1, Math.round(niceStep(Math.max(mx - 1, 4)))); return { lo: 1, hi: Math.max(1 + st * 4, Math.ceil(mx / st) * st), step: st }; }
    const st = niceStep(Math.max(mx, 1)); return { lo: mn, hi: Math.ceil((mx * 1.02) / st) * st || st, step: st };
  }, [all, invert]);
  const n = labels.length;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => { const f = (v - lo) / (hi - lo || 1); return invert ? T + f * (H - T - B) : T + (1 - f) * (H - T - B); };
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += tickStep) ticks.push(t);
  const step = Math.max(1, Math.ceil(n / 10));

  const ends = series.map((s) => { let i = s.values.length - 1; while (i >= 0 && s.values[i] === null) i--; return i >= 0 ? { s, i, v: s.values[i]!, y: y(s.values[i]!) } : null; })
    .filter((e): e is NonNullable<typeof e> => !!e).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16;

  function onMove(e: React.MouseEvent) {
    const r = ref.current!.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1)); setHover(i >= 0 && i < n ? i : null);
  }

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={k === 0 && !invert ? "#d9d7cf" : "#eeede8"} />
            <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#8a8880" className="tabular">{invert ? `#${Math.round(t)}` : format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#8a8880">{l}</text>)}
        {yLabel && <text x={4} y={11} fontSize={10.5} fill="#8a8880">{yLabel}</text>}
        {markers.map((m, k) => {
          const x1 = x(Math.max(0, Math.min(m.from, n - 1)));
          const x2 = m.to === undefined ? x1 : x(Math.max(0, Math.min(m.to, n - 1)));
          return (
            <g key={`mk-${k}`}>
              {x2 > x1 && <rect x={x1} y={T} width={x2 - x1} height={H - T - B} fill={m.color} fillOpacity={0.07} />}
              <line x1={x1} x2={x1} y1={T} y2={H - B} stroke={m.color} strokeWidth={1} strokeDasharray="3 3" />
              <title>{m.label}</title>
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#121211" strokeOpacity={0.25} />}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
          const segs: string[] = []; let cur = "";
          pts.forEach((p) => { if (!p) { if (cur) segs.push(cur); cur = ""; } else cur += `${cur ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`; });
          if (cur) segs.push(cur);
          return <g key={s.name}>{segs.map((d, k) => <path key={k} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
            {hover !== null && s.values[hover] !== null && <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />}
            {n === 1 && s.values[0] !== null && <circle cx={x(0)} cy={y(s.values[0]!)} r={4} fill={s.color} />}
          </g>;
        })}
        {ends.map((e) => (
          <text key={e.s.name} x={W - R + 12} y={e.y + 4} fontSize={12} fill="#4f4e49">
            <tspan fill={e.s.color} fontWeight={700}>● </tspan>{e.s.name.length > 16 ? e.s.name.slice(0, 15) + "…" : e.s.name}
            <tspan fill="#8a8880"> {invert ? `#${Math.round(e.v)}` : format(e.v)}</tspan>
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 z-10 min-w-[170px] rounded-xl bg-surface px-3 py-2.5 text-[12px] shadow-pop ring-1 ring-line"
          style={{ left: `calc(${(x(hover) / W) * 100}% + ${x(hover) / W > 0.6 ? "-190px" : "12px"})` }}>
          <div className="mb-1.5 font-semibold">{labels[hover]}</div>
          {markers.filter((m) => hover >= m.from && hover <= (m.to ?? m.from)).map((m) => (
            <div key={m.label} className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />{m.label}
            </div>
          ))}
          {series.filter((s) => s.values[hover] !== null).sort((a, b) => (invert ? a.values[hover]! - b.values[hover]! : b.values[hover]! - a.values[hover]!)).map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-4 tabular"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}</span><b>{invert ? `#${Math.round(s.values[hover]!)}` : format(s.values[hover]!)}</b></div>
          ))}
        </div>
      )}
    </div>
  );
}
