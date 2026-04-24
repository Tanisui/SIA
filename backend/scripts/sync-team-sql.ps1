param(
  [switch]$Seed
)

$ErrorActionPreference = 'Stop'

function Get-EnvValue {
  param(
    [string]$Name,
    [string]$Default = ''
  )

  $current = [Environment]::GetEnvironmentVariable($Name)
  if ($null -ne $current -and $current -ne '') { return $current }

  $envPath = Join-Path $PSScriptRoot '..\.env'
  if (Test-Path $envPath) {
    $line = Select-String -Path $envPath -Pattern "^$Name=(.*)$" | Select-Object -First 1
    if ($line) { return $line.Matches[0].Groups[1].Value }
  }

  return $Default
}

$dbHost = Get-EnvValue -Name 'DB_HOST' -Default 'localhost'
$dbPort = Get-EnvValue -Name 'DB_PORT' -Default '3306'
$dbName = Get-EnvValue -Name 'DB_DATABASE' -Default 'cecilles_nstyle_db'
$dbUser = Get-EnvValue -Name 'DB_USERNAME' -Default 'root'
$dbPass = Get-EnvValue -Name 'DB_PASSWORD' -Default ''

$sqlFile = Join-Path $PSScriptRoot '..\src\database\sia.sql'
if (-not (Test-Path $sqlFile)) {
  throw "SQL source file not found: $sqlFile"
}

$mysqlCmd = Get-Command mysql -ErrorAction SilentlyContinue
$mysqldumpCmd = Get-Command mysqldump -ErrorAction SilentlyContinue
if (-not $mysqlCmd) { throw 'mysql CLI not found. Install MySQL client tools first.' }
if (-not $mysqldumpCmd) { throw 'mysqldump CLI not found. Install MySQL client tools first.' }

$backupDir = Join-Path $PSScriptRoot '..\backups'
if (-not (Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = Join-Path $backupDir ("${dbName}_pre_sync_${timestamp}.sql")

Write-Host "[1/3] Backing up database to $backupFile"
if ($dbPass -ne '') {
  & $mysqldumpCmd.Source --host=$dbHost --port=$dbPort --user=$dbUser --password=$dbPass $dbName | Out-File -FilePath $backupFile -Encoding utf8
} else {
  & $mysqldumpCmd.Source --host=$dbHost --port=$dbPort --user=$dbUser $dbName | Out-File -FilePath $backupFile -Encoding utf8
}

Write-Host "[2/3] Importing team SQL from $sqlFile"
if ($dbPass -ne '') {
  Get-Content -Raw $sqlFile | & $mysqlCmd.Source --host=$dbHost --port=$dbPort --user=$dbUser --password=$dbPass $dbName
} else {
  Get-Content -Raw $sqlFile | & $mysqlCmd.Source --host=$dbHost --port=$dbPort --user=$dbUser $dbName
}

Write-Host '[3/3] Applying SQL migrations and payroll seeders'
Push-Location (Join-Path $PSScriptRoot '..')
try {
  npm run migrate:sql
} finally {
  Pop-Location
}

if ($Seed) {
  Write-Host '[4/4] Running seed script'
  Push-Location (Join-Path $PSScriptRoot '..')
  try {
    npm run seed
  } finally {
    Pop-Location
  }
} else {
  Write-Host '[4/4] Seed step skipped (use -Seed to include it)'
}

Write-Host 'Database sync complete.'
Write-Host "Backup saved at: $backupFile"
