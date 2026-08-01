const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

export const fmtNum = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '' : inr.format(Number(n))

export const fmtInt = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '' : inr.format(Math.round(Number(n)))

/** Indian compact currency: Cr / L / plain. */
export function fmtINR(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return ''
  const v = Number(n)
  const a = Math.abs(v)
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`
  return `₹${inr.format(Math.round(v))}`
}

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
