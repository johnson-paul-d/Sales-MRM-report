import { Autocomplete, TextField, MenuItem, Button, Paper, Stack, Box } from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import { useFilterOptions } from '../api/hooks'
import { useReportFilters } from '../state/FiltersContext'

export default function FilterBar() {
  const { data } = useFilterOptions()
  const { filters, setFilters, reset } = useReportFilters()

  const users = data?.users ?? []
  const regions = data?.regions ?? []
  const fys = data?.financial_years ?? []
  const divisions = data?.divisions ?? []

  const selectedUsers = users.filter((u) => filters.user_ids?.includes(u.id))
  const selectedRegions = regions.filter((r) => filters.region_ids?.includes(r.id))
  const activeCount =
    (filters.user_ids?.length ? 1 : 0) +
    (filters.region_ids?.length ? 1 : 0) +
    (filters.division?.length ? 1 : 0) +
    (filters.fy ? 1 : 0) +
    (filters.month ? 1 : 0)

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary', minWidth: 70 }}>
          <TuneIcon fontSize="small" />
          <Box component="span" sx={{ fontSize: 13, fontWeight: 700 }}>Filters</Box>
        </Box>
        <Autocomplete
          multiple size="small" sx={{ minWidth: 240, flex: 1 }}
          options={users} getOptionLabel={(o) => o.name ?? o.id}
          value={selectedUsers}
          onChange={(_, val) => setFilters({ ...filters, user_ids: val.map((v) => v.id) })}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          renderInput={(p) => <TextField {...p} label="Salespeople" placeholder="All" />}
          limitTags={2}
        />
        <Autocomplete
          multiple size="small" sx={{ minWidth: 180, flex: 1 }}
          options={regions} getOptionLabel={(o) => o.name}
          value={selectedRegions}
          onChange={(_, val) => setFilters({ ...filters, region_ids: val.map((v) => v.id) })}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          renderInput={(p) => <TextField {...p} label="Region" placeholder="All" />}
          limitTags={2}
        />
        <Autocomplete
          multiple size="small" sx={{ minWidth: 180, flex: 1 }}
          options={divisions}
          value={filters.division ?? []}
          onChange={(_, val) => setFilters({ ...filters, division: val })}
          renderInput={(p) => <TextField {...p} label="Division" placeholder="All" />}
          limitTags={1}
        />
        <TextField
          select size="small" label="Financial Year" sx={{ minWidth: 140 }}
          value={filters.fy ?? ''}
          onChange={(e) => setFilters({ ...filters, fy: e.target.value || null })}
        >
          <MenuItem value="">All</MenuItem>
          {fys.map((fy) => <MenuItem key={fy} value={fy}>{fy}</MenuItem>)}
        </TextField>
        <TextField
          size="small" label="Month" type="month" sx={{ minWidth: 150 }}
          InputLabelProps={{ shrink: true }}
          value={filters.month ?? ''}
          onChange={(e) => setFilters({ ...filters, month: e.target.value || undefined })}
        />
        <Button
          onClick={reset} size="small" variant="outlined" color="inherit"
          disabled={activeCount === 0}
          sx={{ whiteSpace: 'nowrap', color: 'text.secondary', borderColor: 'divider' }}
        >
          Clear{activeCount ? ` (${activeCount})` : ''}
        </Button>
      </Stack>
    </Paper>
  )
}
