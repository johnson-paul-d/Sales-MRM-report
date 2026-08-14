/** Shared ECharts data-label presets so every chart shows its values. */
import { fmtINR, fmtInt } from './formatters'

const val = (v: number, money?: boolean) => (money ? fmtINR(v) : fmtInt(v))

/** Horizontal bar: value at the end of the bar. */
export const barLabel = (money?: boolean) => ({
  show: true, position: 'right' as const, fontSize: 10, color: '#444',
  formatter: (p: any) => val(p.value, money),
})

/** Vertical columns: value on top. */
export const colLabel = (money?: boolean, rotate = 0) => ({
  show: true, position: 'top' as const, fontSize: 10, color: '#444', rotate,
  formatter: (p: any) => val(p.value, money),
})

/** Donut/pie: name + value outside the ring. */
export const pieLabel = (money?: boolean) => ({
  show: true, fontSize: 10, lineHeight: 14,
  formatter: (p: any) => `${p.name}\n${val(p.value, money)}`,
})

/** Funnel: name + value inside the slice. */
export const funnelLabel = (money?: boolean) => ({
  show: true, position: 'inside' as const, color: '#fff', fontSize: 11, lineHeight: 15,
  formatter: (p: any) => `${p.name}\n${val(p.value, money)}`,
})

/** 'YYYY-MM' -> 'Aug 2026' for axis/table display. */
export function fmtMonthName(v: unknown, long = false): string {
  const s = String(v ?? '')
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return s
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' })
}
