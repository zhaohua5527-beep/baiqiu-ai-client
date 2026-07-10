$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $env:APPDATA "npm\node_modules\openclaw"
$targetRoot = Join-Path $appRoot "resources"
$target = Join-Path $targetRoot "openclaw"

if (!(Test-Path $source)) {
  throw "OpenClaw was not found at $source"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
if (Test-Path $target) {
  $empty = Join-Path $targetRoot ".empty-openclaw"
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  robocopy $empty $target /MIR | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "failed to clear old OpenClaw bundle: $LASTEXITCODE"
  }
  Remove-Item -LiteralPath $empty -Force
}

robocopy $source $target /MIR /XD ".git" ".cache" "profile" /XF "*.log" | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Bundled OpenClaw -> $target"
