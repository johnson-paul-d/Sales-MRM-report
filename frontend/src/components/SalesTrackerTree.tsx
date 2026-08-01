import { useState, useMemo, Fragment } from 'react'
import {
  Table, TableHead, TableRow, TableCell, TableBody, IconButton, Paper, Box,
} from '@mui/material'
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { fmtINR, fmtInt } from './formatters'
import type { SalesTrackerRow } from '../api/types'

interface M {
  visits: number
  opportunities_created: number
  open_quotes_value: number
  live_quote_value: number
  closed_won_value: number
  closed_lost_value: number
  dropped_value: number
}
const N = (x: any) => Number(x || 0)
const zero = (): M => ({
  visits: 0, opportunities_created: 0, open_quotes_value: 0, live_quote_value: 0,
  closed_won_value: 0, closed_lost_value: 0, dropped_value: 0,
})
function add(a: M, r: SalesTrackerRow): M {
  a.visits += N(r.visits)
  a.opportunities_created += N(r.opportunities_created)
  a.open_quotes_value += N(r.open_quotes_value)
  a.live_quote_value += N(r.live_quote_value)
  a.closed_won_value += N(r.closed_won_value)
  a.closed_lost_value += N(r.closed_lost_value)
  a.dropped_value += N(r.dropped_value)
  return a
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

interface FyNode { fy_label: string; totals: M; months: SalesTrackerRow[] }
interface UserNode { owner_id: string; user_name: string; region_name: string | null; totals: M; fys: FyNode[] }

function buildTree(rows: SalesTrackerRow[]): UserNode[] {
  const users = new Map<string, UserNode>()
  for (const r of rows) {
    let u = users.get(r.owner_id)
    if (!u) {
      u = { owner_id: r.owner_id, user_name: r.user_name, region_name: r.region_name, totals: zero(), fys: [] }
      users.set(r.owner_id, u)
    }
    add(u.totals, r)
    let fy = u.fys.find((f) => f.fy_label === r.fy_label)
    if (!fy) {
      fy = { fy_label: r.fy_label, totals: zero(), months: [] }
      u.fys.push(fy)
    }
    add(fy.totals, r)
    fy.months.push(r)
  }
  const list = Array.from(users.values())
  list.sort((a, b) => b.totals.closed_won_value - a.totals.closed_won_value)
  for (const u of list) {
    u.fys.sort((a, b) => (a.fy_label < b.fy_label ? 1 : -1))
    for (const fy of u.fys) fy.months.sort((a, b) => (a.year_month < b.year_month ? -1 : 1))
  }
  return list
}

const HEADERS = ['Visits', 'Opps', 'Open Quotes', 'Live Quotes', 'Closed Won', 'Closed Lost', 'Dropped']

function MeasureCells({ m }: { m: M }) {
  return (
    <>
      <TableCell align="right">{fmtInt(m.visits)}</TableCell>
      <TableCell align="right">{fmtInt(m.opportunities_created)}</TableCell>
      <TableCell align="right">{fmtINR(m.open_quotes_value)}</TableCell>
      <TableCell align="right">{fmtINR(m.live_quote_value)}</TableCell>
      <TableCell align="right" sx={{ color: 'success.main' }}>{fmtINR(m.closed_won_value)}</TableCell>
      <TableCell align="right" sx={{ color: 'error.main' }}>{fmtINR(m.closed_lost_value)}</TableCell>
      <TableCell align="right" sx={{ color: 'warning.main' }}>{fmtINR(m.dropped_value)}</TableCell>
    </>
  )
}

export default function SalesTrackerTree({ rows }: { rows: SalesTrackerRow[] }) {
  const tree = useMemo(() => buildTree(rows), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }

  return (
    <Paper variant="outlined" sx={{ mt: 1, maxHeight: 'calc(100vh - 620px)', overflow: 'auto' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 240 }}>Salesperson / FY / Month</TableCell>
            {HEADERS.map((h) => (
              <TableCell key={h} align="right" sx={{ fontWeight: 700 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tree.map((u) => {
            const uOpen = expanded.has(u.owner_id)
            return (
              <Fragment key={u.owner_id}>
                <TableRow hover sx={{ '& td': { fontWeight: 600 } }}>
                  <TableCell>
                    <IconButton size="small" onClick={() => toggle(u.owner_id)}>
                      {uOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                    </IconButton>
                    {u.user_name}
                    {u.region_name && (
                      <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 1 }}>
                        · {u.region_name}
                      </Box>
                    )}
                  </TableCell>
                  <MeasureCells m={u.totals} />
                </TableRow>

                {uOpen && u.fys.map((fy) => {
                  const fyKey = `${u.owner_id}|${fy.fy_label}`
                  const fyOpen = expanded.has(fyKey)
                  return (
                    <Fragment key={fyKey}>
                      <TableRow hover sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ pl: 5 }}>
                          <IconButton size="small" onClick={() => toggle(fyKey)}>
                            {fyOpen ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                          </IconButton>
                          {fy.fy_label}
                        </TableCell>
                        <MeasureCells m={fy.totals} />
                      </TableRow>
                      {fyOpen && fy.months.map((mo) => (
                        <TableRow key={`${fyKey}|${mo.year_month}`}>
                          <TableCell sx={{ pl: 12, color: 'text.secondary' }}>{monthLabel(mo.year_month)}</TableCell>
                          <MeasureCells m={mo as unknown as M} />
                        </TableRow>
                      ))}
                    </Fragment>
                  )
                })}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </Paper>
  )
}
