# =====================================================================
# run_etl.ps1 - Salesforce -> Postgres incremental ETL runner.
# Invoked by the "Sieger ETL - Salesforce to Postgres" scheduled task
# (every 6h). Runs salesforce_to_postgres.py with the dedicated venv and
# appends all output to logs\etl_<timestamp>.log.
#
# The ETL replaces the forecast report tables each run, and the reporting
# views vw_forecasts / vw_forecast_latest depend on them. The Python sync
# drops the views right before reloading those tables and rebuilds them
# itself afterwards (rebuild_forecast_views). The finally block below
# re-applies sql\03_forecasts.sql via psql on every exit -- success, sync
# failure, or a killed process -- as a second line of defence, so a mid-run
# death can no longer leave the views missing (03_forecasts.sql
# drops-if-exists first, so it is safe to run unconditionally).
# =====================================================================
param(
  [int]$MaxAttempts   = 2,    # total tries of the Python sync (1 = no retry)
  [int]$RetryDelaySec = 300   # wait before retrying, e.g. transient Salesforce outage
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$logDir = Join-Path $root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$log   = Join-Path $logDir "etl_$stamp.log"
$py    = Join-Path $root '.venv-etl\Scripts\python.exe'
# First psql that exists: known install paths (newest first), then PATH.
$psql  = @('C:\Program Files\PostgreSQL\18\bin\psql.exe',
           'C:\Program Files\PostgreSQL\17\bin\psql.exe',
           'C:\Program Files\PostgreSQL\16\bin\psql.exe') +
         @((Get-Command psql.exe -ErrorAction SilentlyContinue).Source) |
         Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

# Load PG_* settings from .env into libpq's PG* vars so psql can connect.
Get-Content (Join-Path $root '.env') | Where-Object { $_ -match '^\s*PG_[A-Z_]+\s*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2
  Set-Item -Path ("Env:" + $k.Trim()) -Value $v.Trim()
}
$env:PGHOST = $env:PG_HOST; $env:PGPORT = $env:PG_PORT; $env:PGDATABASE = $env:PG_DATABASE
$env:PGUSER = $env:PG_USERNAME; $env:PGPASSWORD = $env:PG_PASSWORD

"[$(Get-Date -Format o)] ETL start (python: $py)" | Out-File -FilePath $log -Encoding utf8

$code = 1
try {
  # 1. Run the Salesforce -> Postgres sync, retrying once on failure
  #    (a killed process or a Salesforce connection drop both exit non-zero;
  #    the sync upserts, so a re-run over partial progress is safe).
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    if ($attempt -gt 1) {
      "[$(Get-Date -Format o)] Sync failed (exit $code); retrying in $RetryDelaySec s (attempt $attempt of $MaxAttempts)" | Out-File -FilePath $log -Append -Encoding utf8
      Start-Sleep -Seconds $RetryDelaySec
    }
    & $py 'salesforce_to_postgres.py' *>> $log
    $code = $LASTEXITCODE
    if ($code -eq 0) { break }
  }
}
finally {
  # 2. Rebuild the forecast views no matter how the sync ended -- the app's
  #    Last Month page 500s while they are missing. (Python does this too;
  #    this covers a killed/crashed python.) Loud if it can't run or fails.
  if ($psql) {
    & $psql -q -v ON_ERROR_STOP=1 -f (Join-Path $root 'sql\03_forecasts.sql') *>> $log
    if ($LASTEXITCODE -ne 0) {
      "[$(Get-Date -Format o)] WARNING: psql view rebuild exited $LASTEXITCODE -- check vw_forecasts exists" | Out-File -FilePath $log -Append -Encoding utf8
    }
  } else {
    "[$(Get-Date -Format o)] WARNING: psql.exe not found -- forecast views only rebuilt if python completed" | Out-File -FilePath $log -Append -Encoding utf8
  }
  "[$(Get-Date -Format o)] ETL finished with exit code $code" | Out-File -FilePath $log -Append -Encoding utf8
}

# Retain 30 days of logs.
Get-ChildItem $logDir -Filter 'etl_*.log' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
