$ErrorActionPreference = "Stop"

function U8($b64) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }

$appRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $appRoot)
$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) (U8 "55m955CDQUk=")
$electronDist = Join-Path $appRoot "node_modules\electron\dist"
$fallbackElectronDist = Join-Path $repoRoot "work\openclaw-desktop\node_modules\electron\dist"
$rcedit = Join-Path $appRoot "node_modules\electron-winstaller\vendor\rcedit.exe"
$namePrefix = U8 "55m955CDQUk="
$clientName = U8 "55m955CDQUkt5a6i5oi356uv"
$devName = U8 "55m955CDQUkt5byA5Y+R6ICF"
$updateName = U8 "55m955CDQUktdXBkYXRl"
$clientLinkName = U8 "55m955CDQUnvvIjlrqLmiLfnq6/vvIkubG5r"
$devLinkName = U8 "55m955CDQUnvvIjlvIDlj5HogIXvvIkubG5r"
$clientCmdName = U8 "5ZCv5Yqo55m955CDQUkt5a6i5oi356uvLmNtZA=="
$devCmdName = U8 "5ZCv5Yqo55m955CDQUkt5byA5Y+R6ICFLmNtZA=="
$clientRoot = Join-Path $desktop $clientName
$devRoot = Join-Path $desktop $devName
$updateRoot = Join-Path $desktop $updateName
$version = "1.1.1"
$dReleaseRoot = Join-Path "D:\BaiQiuAI\release" $version

function Stop-BaiqiuProcesses {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -like "Baiqiu*" -or $_.ProcessName -like ($namePrefix + "*") } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Clear-Directory($path) {
  if (Test-Path -LiteralPath $path) {
    $empty = Join-Path $env:TEMP ("baiqiu-empty-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $empty | Out-Null
    robocopy $empty $path /MIR | Out-Null
    if ($LASTEXITCODE -gt 7) { throw "Failed to clear $path : robocopy exit $LASTEXITCODE" }
    Remove-Item -LiteralPath $empty -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Force -Path $path | Out-Null
}

function Set-ExeIcon($exePath) {
  $sourceIcon = Join-Path $appRoot "assets\icon.ico"
  if (!(Test-Path -LiteralPath $sourceIcon)) { $sourceIcon = Join-Path $appRoot "renderer\assets\baiqiu-icon.ico" }
  if (!(Test-Path -LiteralPath $rcedit) -or !(Test-Path -LiteralPath $exePath) -or !(Test-Path -LiteralPath $sourceIcon)) { return }

  $work = Join-Path $env:TEMP ("baiqiu-rcedit-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $tempExe = Join-Path $work "BaiqiuAI.exe"
  try {
    Copy-Item -LiteralPath $exePath -Destination $tempExe -Force
    & $rcedit $tempExe --set-icon $sourceIcon
    if ($LASTEXITCODE -ne 0) { throw "rcedit exit $LASTEXITCODE" }
    $copied = $false
    for ($i = 0; $i -lt 10; $i += 1) {
      try {
        Copy-Item -LiteralPath $tempExe -Destination $exePath -Force
        $copied = $true
        break
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    if (-not $copied) { throw "failed to write patched icon exe: $exePath" }
  } finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-DesktopOldBaiqiu {
  Get-ChildItem -LiteralPath $desktop -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like ($namePrefix + "*") } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $startMenu) {
    Remove-Item -LiteralPath $startMenu -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-OldDReleases {
  $releaseBase = "D:\BaiQiuAI\release"
  if (!(Test-Path -LiteralPath $releaseBase)) { return }
  Get-ChildItem -LiteralPath $releaseBase -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.PSIsContainer -and $_.Name -ne $version } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}

function Copy-AppPortable($targetRoot, [bool]$isDev) {
  Clear-Directory $targetRoot
  robocopy $electronDist $targetRoot /MIR | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Failed to copy Electron runtime to $targetRoot : $LASTEXITCODE" }

  $appOut = Join-Path $targetRoot "resources\app"
  New-Item -ItemType Directory -Force -Path $appOut | Out-Null
  robocopy $appRoot $appOut /MIR /XD ".git" "dist" /XF "package-lock.json" | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "Failed to copy Baiqiu app to $appOut : $LASTEXITCODE" }

  @{
    appVersion = $version
    build = (Get-Date).ToString("yyyyMMdd")
    channel = $(if ($isDev) { "dev" } else { "customer" })
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $appOut "version.json") -Encoding UTF8

  $electronExe = Join-Path $targetRoot "electron.exe"
  $namedExe = Join-Path $targetRoot "BaiqiuAI.exe"
  if (Test-Path -LiteralPath $electronExe) {
    if (Test-Path -LiteralPath $namedExe) { Remove-Item -LiteralPath $namedExe -Force -ErrorAction SilentlyContinue }
    Rename-Item -LiteralPath $electronExe -NewName "BaiqiuAI.exe"
  }
  Set-ExeIcon $namedExe

  @{
    mode = $(if ($isDev) { "dev" } else { "client" })
    version = $version
    generatedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $targetRoot "baiqiu-mode.json") -Encoding UTF8

  $cmdName = if ($isDev) { $devCmdName } else { $clientCmdName }
  $args = if ($isDev) { " --dev" } else { "" }
  $cmd = Join-Path $targetRoot $cmdName
  "@echo off`r`ncd /d ""%~dp0""`r`nstart ""BaiqiuAI"" ""%~dp0BaiqiuAI.exe""$args`r`n" | Set-Content -LiteralPath $cmd -Encoding ASCII
}

function New-Shortcut($linkPath, $targetRoot, [bool]$isDev) {
  $target = Join-Path $targetRoot "BaiqiuAI.exe"
  $icon = Join-Path $targetRoot "resources\app\assets\icon.ico"
  if (!(Test-Path -LiteralPath $icon)) { $icon = Join-Path $targetRoot "resources\app\renderer\assets\baiqiu-icon.ico" }
  $ws = New-Object -ComObject WScript.Shell
  $link = $ws.CreateShortcut($linkPath)
  $link.TargetPath = $target
  $link.WorkingDirectory = $targetRoot
  $link.Arguments = $(if ($isDev) { "--dev" } else { "" })
  if (Test-Path -LiteralPath $icon) { $link.IconLocation = "$icon,0" }
  $link.Save()
}

function Write-Installer($path) {
  $lines = @(
    '$ErrorActionPreference = "Stop"',
    'function U8($b64) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }',
    '$namePrefix = U8 "55m955CDQUk="',
    '$clientName = U8 "55m955CDQUkt5a6i5oi356uv"',
    '$devName = U8 "55m955CDQUkt5byA5Y+R6ICF"',
    '$clientLinkName = U8 "55m955CDQUnvvIjlrqLmiLfnq6/vvIkubG5r"',
    '$devLinkName = U8 "55m955CDQUnvvIjlvIDlj5HogIXvvIkubG5r"',
    '$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    '$desktop = [Environment]::GetFolderPath("Desktop")',
    '$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) $namePrefix',
    '$zipPath = Join-Path $scriptDir "update.zip"',
    'if (!(Test-Path -LiteralPath $zipPath)) { $zipPath = Join-Path (Split-Path -Parent $scriptDir) "update.zip" }',
    'if (!(Test-Path -LiteralPath $zipPath)) { throw "update.zip not found." }',
    '$work = Join-Path $env:TEMP ("BaiqiuAI-Update-" + [Guid]::NewGuid().ToString("N"))',
    '$zipCopy = Join-Path $work "update.zip"',
    '$stage = Join-Path $work "stage"',
    'New-Item -ItemType Directory -Force -Path $work, $stage | Out-Null',
    'Copy-Item -LiteralPath $zipPath -Destination $zipCopy -Force',
    'Stop-Process -Name "Baiqiu*" -Force -ErrorAction SilentlyContinue',
    'Start-Sleep -Milliseconds 800',
    'Remove-Item "$env:APPDATA\Baiqiu*" -Recurse -Force -ErrorAction SilentlyContinue',
    'Remove-Item "$env:APPDATA\BaiqiuA*" -Recurse -Force -ErrorAction SilentlyContinue',
    'Remove-Item "$env:USERPROFILE\Desktop\$namePrefix*" -Recurse -Force -ErrorAction SilentlyContinue',
    'Remove-Item -LiteralPath $startMenu -Recurse -Force -ErrorAction SilentlyContinue',
    '$appDataRoot = Join-Path $env:APPDATA "Baiqiu AI"',
    'New-Item -ItemType Directory -Force -Path $appDataRoot | Out-Null',
    'Expand-Archive -LiteralPath $zipCopy -DestinationPath $stage -Force',
    'Expand-Archive -LiteralPath $zipCopy -DestinationPath $appDataRoot -Force',
    '$clientSource = Join-Path $stage "client"',
    '$devSource = Join-Path $stage "dev"',
    '$clientTarget = Join-Path $desktop $clientName',
    '$devTarget = Join-Path $desktop $devName',
    'Copy-Item -LiteralPath $clientSource -Destination $clientTarget -Recurse -Force',
    'Copy-Item -LiteralPath $devSource -Destination $devTarget -Recurse -Force',
    '$ws = New-Object -ComObject WScript.Shell',
    'New-Item -ItemType Directory -Force -Path $startMenu | Out-Null',
    '$clientLink = $ws.CreateShortcut((Join-Path $desktop $clientLinkName))',
    '$clientLink.TargetPath = Join-Path $clientTarget "BaiqiuAI.exe"',
    '$clientLink.WorkingDirectory = $clientTarget',
    '$clientIcon = Join-Path $clientTarget "resources\app\assets\icon.ico"',
    'if (Test-Path -LiteralPath $clientIcon) { $clientLink.IconLocation = "$clientIcon,0" }',
    '$clientLink.Save()',
    '$clientStartLink = $ws.CreateShortcut((Join-Path $startMenu $clientLinkName))',
    '$clientStartLink.TargetPath = Join-Path $clientTarget "BaiqiuAI.exe"',
    '$clientStartLink.WorkingDirectory = $clientTarget',
    'if (Test-Path -LiteralPath $clientIcon) { $clientStartLink.IconLocation = "$clientIcon,0" }',
    '$clientStartLink.Save()',
    '$devLink = $ws.CreateShortcut((Join-Path $desktop $devLinkName))',
    '$devLink.TargetPath = Join-Path $devTarget "BaiqiuAI.exe"',
    '$devLink.WorkingDirectory = $devTarget',
    '$devLink.Arguments = "--dev"',
    '$devIcon = Join-Path $devTarget "resources\app\assets\icon.ico"',
    'if (Test-Path -LiteralPath $devIcon) { $devLink.IconLocation = "$devIcon,0" }',
    '$devLink.Save()',
    '$devStartLink = $ws.CreateShortcut((Join-Path $startMenu $devLinkName))',
    '$devStartLink.TargetPath = Join-Path $devTarget "BaiqiuAI.exe"',
    '$devStartLink.WorkingDirectory = $devTarget',
    '$devStartLink.Arguments = "--dev"',
    'if (Test-Path -LiteralPath $devIcon) { $devStartLink.IconLocation = "$devIcon,0" }',
    '$devStartLink.Save()',
    'Start-Process -FilePath (Join-Path $clientTarget "BaiqiuAI.exe") -WorkingDirectory $clientTarget',
    'Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue'
  )
  [IO.File]::WriteAllText($path, ($lines -join "`r`n"), [Text.UTF8Encoding]::new($true))
}

if (!(Test-Path $electronDist) -and (Test-Path $fallbackElectronDist)) { $electronDist = $fallbackElectronDist }
if (!(Test-Path $electronDist)) { throw "Electron runtime was not found. Run npm install in work\heiqiu-ai first." }
if (!(Test-Path (Join-Path $appRoot "node_modules"))) { throw "Runtime dependencies are missing. Run npm install in work\heiqiu-ai first." }

& (Join-Path $PSScriptRoot "bundle-openclaw.ps1")
Stop-BaiqiuProcesses
Remove-DesktopOldBaiqiu
Remove-OldDReleases
Copy-AppPortable $clientRoot $false
Copy-AppPortable $devRoot $true
New-Shortcut (Join-Path $desktop $clientLinkName) $clientRoot $false
New-Shortcut (Join-Path $desktop $devLinkName) $devRoot $true
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
New-Shortcut (Join-Path $startMenu $clientLinkName) $clientRoot $false
New-Shortcut (Join-Path $startMenu $devLinkName) $devRoot $true

New-Item -ItemType Directory -Force -Path $updateRoot | Out-Null
@{
  version = $version
  client = $true
  dev = $true
  forceClean = $true
  generatedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $updateRoot "version.json") -Encoding UTF8
Write-Installer (Join-Path $updateRoot "install.ps1")

$zipStage = Join-Path $env:TEMP ("BaiqiuAI-ZipStage-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $zipStage | Out-Null
$clientStage = Join-Path $zipStage "client"
$devStage = Join-Path $zipStage "dev"
robocopy $clientRoot $clientStage /MIR | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Failed to stage client package : $LASTEXITCODE" }
robocopy $devRoot $devStage /MIR | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Failed to stage dev package : $LASTEXITCODE" }
Copy-Item -LiteralPath (Join-Path $updateRoot "install.ps1") -Destination (Join-Path $zipStage "install.ps1") -Force
Copy-Item -LiteralPath (Join-Path $updateRoot "version.json") -Destination (Join-Path $zipStage "version.json") -Force
$zipPath = Join-Path $updateRoot "update.zip"
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
tar.exe -a -c -f $zipPath -C $zipStage .
if ($LASTEXITCODE -ne 0) { throw "Failed to create update.zip : tar exit $LASTEXITCODE" }
Remove-Item -LiteralPath $zipStage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Client -> $clientRoot"
Write-Host "Dev    -> $devRoot"
Write-Host "Update -> $zipPath"
Write-Host "Shortcuts created on Desktop."
