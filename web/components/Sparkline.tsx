import { tr } from "@/lib/i18n";

export default function Sparkline({ values, color, width = 120, height = 32 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <span className="text-[11.5px] text-muted">{tr("not enough history", "이력 부족")}</span>;
  const lo = Math.min(...pts.map((p) => p.v)); const hi = Math.max(...pts.map((p) => p.v)); const rng = hi - lo || 1;
  const x = (i: number) => 3 + (i * (width - 6)) / (values.length - 1);
  const y = (v: number) => height - 4 - ((v - lo) / rng) * (height - 8);
  const d = pts.map((p, j) => `${j ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={`${d} L${x(last.i)},${height} L${x(pts[0].i)},${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.75} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
