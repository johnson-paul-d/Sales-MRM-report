/** Shared ECharts depth styling + motion so every chart looks polished:
 *  gradient fills, soft shadows ("3D" depth), hover lift, staggered entry
 *  animations, and adaptive bar widths (lonely bars grow wide). */

/** Lighten (pct>0) or darken (pct<0) a #rrggbb colour. */
function shade(hex: string, pct: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) =>
    Math.round(Math.min(255, Math.max(0, pct >= 0 ? v + (255 - v) * pct : v * (1 + pct))))
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Vertical gradient (columns): light top -> deep base. */
export const gradV = (color: string) => ({
  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [
    { offset: 0, color: shade(color, 0.30) },
    { offset: 1, color: shade(color, -0.14) },
  ],
})

/** Horizontal gradient (bars): deep start -> light tip. */
export const gradH = (color: string) => ({
  type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
  colorStops: [
    { offset: 0, color: shade(color, -0.14) },
    { offset: 1, color: shade(color, 0.30) },
  ],
})

/** Value-mapped vertical gradient: t in [0,1] (value/max) — the bigger the
 *  value, the deeper and richer the bar, so colour itself ranks the months. */
export const gradByValue = (color: string, t: number) => ({
  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [
    { offset: 0, color: shade(color, 0.55 - 0.40 * t) },
    { offset: 1, color: shade(color, 0.10 - 0.28 * t) },
  ],
})

/** Per-datum palette gradients so categorical bars (people, opps) get their
 *  own colour instead of a monochrome wall. */
export const paletteGradV = (palette: string[], i: number) => gradV(palette[i % palette.length])
export const paletteGradH = (palette: string[], i: number) => gradH(palette[i % palette.length])

/** Soft drop shadow that gives bars/slices depth. */
export const DEPTH = {
  shadowBlur: 6,
  shadowColor: 'rgba(20, 20, 20, 0.28)',
  shadowOffsetY: 3,
}

/** Hover: lift the element and sharpen focus. */
export const BAR_EMPHASIS = {
  itemStyle: { shadowBlur: 14, shadowOffsetY: 6, shadowColor: 'rgba(20, 20, 20, 0.4)' },
}
export const PIE_EMPHASIS = {
  scale: true, scaleSize: 8,
  itemStyle: { shadowBlur: 16, shadowColor: 'rgba(20, 20, 20, 0.35)' },
  label: { fontWeight: 700 as const },
}

/** Smooth staggered entry + gentle update transitions (filter changes). */
export const ANIM = {
  animationDuration: 900,
  animationEasing: 'cubicOut' as const,
  animationDelay: (idx: number) => idx * 60,
  animationDurationUpdate: 500,
  animationEasingUpdate: 'cubicInOut' as const,
}

/** Adaptive bar thickness: few bars -> wide, confident bars. */
export const barWidth = (count: number) =>
  count <= 1 ? 120 : count <= 3 ? 76 : count <= 6 ? 52 : 30

/** Paper hover lift for chart cards (matches KpiCard). */
export const CARD_HOVER = {
  transition: 'box-shadow .25s ease, transform .25s ease',
  '&:hover': { boxShadow: '0 10px 26px rgba(16,24,40,0.12)', transform: 'translateY(-2px)' },
}
