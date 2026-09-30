'use client';

import { useState } from 'react';

type Point = { date: string; value: number };

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Single-series daily bars: one hue, 2px gaps, per-bar hover tooltip.
 * Bars are a stretched SVG; all text is HTML so it stays at normal size at any width.
 */
export function DailyChart({ points, label }: { points: Point[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 100 ? 20 : 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const total = points.reduce((n, p) => n + p.value, 0);
  const H = 100;
  const W = points.length * 10;

  return (
    <figure className="space-y-1 pt-2">
      <div className="relative h-44">
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(1 - f) * 100}%`, transform: 'translateY(-50%)' }}>
            <div className="h-px flex-1 bg-border" />
            <span className="w-6 text-right text-[11px] text-muted tabular-nums">{Math.round(top * f)}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 left-0 right-8">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`${label} per day, ${total} in total`} onMouseLeave={() => setHover(null)}>
          {points.map((p, i) => {
            const h = (p.value / top) * H;
            return (
              <g key={p.date} onMouseEnter={() => setHover(i)}>
                <rect x={i * 10} y={0} width={10} height={H} fill="transparent" />
                {h > 0 && <rect x={i * 10 + 1} y={H - h} width={8} height={h} rx={1.5} fill="var(--brand)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 rounded-md bg-gray-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow"
            style={{ left: `${((hover + 0.5) / points.length) * 100}%`, transform: 'translate(-50%, -100%)' }}
          >
            {fmtDay(points[hover].date)} · <b>{points[hover].value}</b> {label.toLowerCase()}
          </div>
        )}
        </div>
      </div>
      <div className="flex justify-between pr-8 text-[11px] text-muted">
        <span>{fmtDay(points[0].date)}</span>
        <span>{fmtDay(points[points.length - 1].date)}</span>
      </div>
    </figure>
  );
}
