# =====================================================================
# run_etl.ps1 - Salesforce -> Postgres incremental ETL runner.
# Invoked by the "Sieger ETL - Salesforce to Postgres" scheduled task
# (every 6h). Runs salesforce_to_postgres.py with the dedicated venv and
# appends all output to logs\etl_<timestamp>.log.
#
# The ETL drops+recreates the forecast report tables each run, but the
# reporting views vw_forecasts / vw_forecast_latest depend on them. So we
# drop those views first and rebuild them (sql\03_forecasts.sql) afterward.
# =====================================================================
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$log   = Join-Path $logDir "etl_$stamp.log"
$py    = Join-Path $root '.venv-etl\Scripts\python.exe'
$psql  = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

# Load PG_* settings from .env into libpq's PG* vars so psql can connect.
Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*PG_[A-Z_]+\s*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item -Path ("Env:" + $k.Trim()) -Value $v.Trim()
}
$env:PGHOST = $env:PG_HOST; $env:PGPORT = $env:PG_PORT; $env:PGDATABASE = $env:PG_DATABASE
$env:PGUSER = $env:PG_USERNAME; $env:PGPASSWORD = $env:PG_PASSWORD

"[$(Get-Date -Format o)] ETL start (python: $py)" | Out-File -FilePath $log -Encoding utf8

# 1. Drop views that depend on the forecast report tables (lets the ETL drop/recreate them).
if (Test-Path $psql) {
  & $psql -q -c "DROP VIEW IF EXISTS vw_forecast_latest CASCADE; DROP VIEW IF EXISTS vw_forecasts CASCADE;" *>> $log
}

# 2. Run the incremental Salesforce -> Postgres sync.
& $py 'salesforce_to_postgres.py' *>> $log
$code = $LASTEXITCODE

# 3. Rebuild the forecast views on the refreshed tables.
if (Test-Path $psql) {
  & $psql -q -f (Join-Path $root 'sql\03_forecasts.sql') *>> $log
}

"[$(Get-Date -Format o)] ETL finished with exit code $code" | Out-File -FilePath $log -Append -Encoding utf8

# Retain 30 days of logs.
Get-ChildItem $logDir -Filter 'etl_*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
