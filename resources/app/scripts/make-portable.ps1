$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $appRoot)
$outRoot = Join-Path $repoRoot "outputs\BaiqiuAI-Portable"
$electronDist = Join-Path $appRoot "node_modules\electron\dist"
$fallbackElectronDist = Join-Path $repoRoot "work\openclaw-desktop\node_modules\electron\dist"

& (Join-Path $PSScriptRoot "bundle-openclaw.ps1")

if (!(Test-Path $electronDist) -and (Test-Path $fallbackElectronDist)) {
  $electronDist = $fallbackElectronDist
}
if (!(Test-Path $electronDist)) {
  throw "Electron runtime was not found. Run npm install in work\heiqiu-ai first."
}

if (Test-Path $outRoot) {
  $emptyOut = Join-Path $repoRoot "outputs\.empty-portable"
  New-Item -ItemType Directory -Force -Path $emptyOut | Out-Null
  robocopy $emptyOut $outRoot /MIR | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Failed to clear old portable build: $LASTEXITCODE"
  }
  Remove-Item -LiteralPath $emptyOut -Force
}
New-Item -ItemType Directory -Force -Path $outRoot | Out-Null

robocopy $electronDist $outRoot /MIR | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "Failed to copy Electron runtime: $LASTEXITCODE"
}

$appOut = Join-Path $outRoot "resources\app"
New-Item -ItemType Directory -Force -Path $appOut | Out-Null
if (!(Test-Path (Join-Path $appRoot "node_modules"))) {
  throw "Runtime dependencies are missing. Run npm install --omit=dev in work\heiqiu-ai first."
}

robocopy $appRoot $appOut /MIR /XD ".git" /XF "package-lock.json" | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "Failed to copy app: $LASTEXITCODE"
}

$exe = Join-Path $outRoot "electron.exe"
$namedExe = Join-Path $outRoot "BaiqiuAI.exe"
if (Test-Path $exe) {
  Rename-Item -LiteralPath $exe -NewName "BaiqiuAI.exe"
}

$icon = Join-Path $appOut "renderer\assets\baiqiu-icon.ico"
$shortcutName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("55m955CDIEFJLmxuaw=="))
$shortcut = Join-Path $outRoot $shortcutName
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) $shortcutName
$ws = New-Object -ComObject WScript.Shell
foreach ($linkPath in @($shortcut, $desktopShortcut)) {
  $link = $ws.CreateShortcut($linkPath)
  $link.TargetPath = $namedExe
  $link.WorkingDirectory = $outRoot
  $link.IconLocation = "$icon,0"
  $link.Save()
}

Write-Host "Portable build ready -> $outRoot"
Write-Host "Run -> $namedExe"
