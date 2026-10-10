"use client";

import { CATEGORY_LABEL, compact } from "@/lib/format";
import { QUADRANT, type CategoryPosition } from "@/lib/portfolio";

const W = 680; const H = 380; const PAD = { l: 56, r: 20, t: 22, b: 44 };

/** Growth-share matrix: x = relative share (log scale, 1.0 = level with the category leader), y = category growth. */
export default function Matrix({ rows, split, onPick, anchor }: { rows: CategoryPosition[]; split: number; onPick: (r: CategoryPosition) => void; anchor: string }) {
  const placed = rows.filter((r) => r.quadrant);
  if (!placed.length) return null;
  const xs = placed.map((r) => r.relShare);
  const x0 = Math.min(0.01, ...xs) / 1.5; const x1 = Math.max(3, ...xs) * 1.5;
  const ys = placed.map((r) => r.growth);
  const y0 = Math.min(-0.1, ...ys) - 0.05; const y1 = Math.max(0.2, ...ys) + 0.05;
  const X = (v: number) => PAD.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + ((y1 - v) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const maxT = Math.max(...placed.map((r) => r.total));
  const R = (t: number) => 7 + Math.sqrt(t / maxT) * 20;
  const ticks = [0.01, 0.1, 1].filter((t) => t > x0 && t < x1);
  const quad = (q: keyof typeof QUADRANT, x: number, y: number, anchorEnd = false) => (
    <text x={x} y={y} textAnchor={anchorEnd ? "end" : "start"} className="fill-[#8a8880] text-[11px] font-semibold uppercase tracking-[0.08em]">{QUADRANT[q].label}</text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Growth-share matrix">
      <rect x={X(1)} y={PAD.t} width={W - PAD.r - X(1)} height={Y(split) - PAD.t} fill="#eaf6ee" opacity={0.6} />
      <rect x={PAD.l} y={Y(split)} width={X(1) - PAD.l} height={H - PAD.b - Y(split)} fill="#fbecea" opacity={0.5} />
      <line x1={X(1)} x2={X(1)} y1={PAD.t} y2={H - PAD.b} stroke="#c9c7bf" strokeDasharray="4 4" />
      <line x1={PAD.l} x2={W - PAD.r} y1={Y(split)} y2={Y(split)} stroke="#c9c7bf" strokeDasharray="4 4" />
      {quad("question", PAD.l + 8, PAD.t + 14)}{quad("star", W - PAD.r - 8, PAD.t + 14, true)}
      {quad("dog", PAD.l + 8, H - PAD.b - 8)}{quad("cash_cow", W - PAD.r - 8, H - PAD.b - 8, true)}
      {ticks.map((t) => <text key={t} x={X(t)} y={H - PAD.b + 16} textAnchor="middle" className="fill-[#8a8880] text-[11px]">{t === 1 ? "1× (level)" : `${t}×`}</text>)}
      <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" className="fill-[#5c5b56] text-[11.5px]">{anchor}&apos;s share of recent reviews ÷ the category leader&apos;s (log scale) →</text>
      <text x={14} y={(PAD.t + H - PAD.b) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})`} className="fill-[#5c5b56] text-[11.5px]">Category growth, reviews 3 mo vs prior 3 →</text>
      <text x={PAD.l - 6} y={Y(split) - 4} textAnchor="end" className="fill-[#8a8880] text-[10.5px]">{`${split >= 0 ? "+" : ""}${Math.round(split * 100)}%`}</text>
      {placed.sort((a, b) => b.total - a.total).map((r) => (
        <g key={r.category} onClick={() => onPick(r)} className="cursor-pointer">
          <title>{`${CATEGORY_LABEL[r.category] ?? r.category}: ${r.relShare.toFixed(2)}× ${r.leader.brand}, category ${r.growth >= 0 ? "+" : ""}${Math.round(r.growth * 100)}%, ${compact(r.total)} reviews`}</title>
          <circle cx={X(r.relShare)} cy={Y(r.growth)} r={R(r.total)} fill="#121211" fillOpacity={0.12} stroke="#121211" strokeWidth={1.2} />
          <text x={X(r.relShare)} y={Y(r.growth) - R(r.total) - 4} textAnchor="middle" className="fill-[#121211] text-[11.5px] font-medium">{CATEGORY_LABEL[r.category] ?? r.category}</text>
        </g>
      ))}
    </svg>
  );
}
