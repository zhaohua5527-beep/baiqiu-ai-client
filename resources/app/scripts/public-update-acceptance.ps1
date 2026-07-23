$ErrorActionPreference = "Stop"

$officialLatest = "https://baiqiuai.xiaoxin8.com/latest.json"
$officialFallback = "https://baiqiuai.xiaoxin8.com/update.json"
$expectedVersion = "2.1.1"
$work = Join-Path $env:RUNNER_TEMP ("baiqiu-public-update-" + [Guid]::NewGuid().ToString("N"))
$package = Join-Path $work "baiqiu-update.zip"
$extracted = Join-Path $work "package"
$testRoot = Join-Path $work "upgrade-test"
$canonicalLatest = $true
$manifestSource = $officialLatest
New-Item -ItemType Directory -Force -Path $work, $extracted, $testRoot | Out-Null

try {
  try {
    $manifest = Invoke-RestMethod -Uri ($officialLatest + "?ts=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Headers @{ "Cache-Control" = "no-store" }
  } catch {
    $canonicalLatest = $false
    $manifestSource = $officialFallback
    $manifest = Invoke-RestMethod -Uri ($officialFallback + "?ts=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Headers @{ "Cache-Control" = "no-store" }
  }

  $version = [string]$(if ($manifest.version) { $manifest.version } else { $manifest.latestVersion })
  $downloadUrl = [string]$(if ($manifest.downloadUrl) { $manifest.downloadUrl } else { $manifest.packageUrl })
  $expectedSha = ([string]$(if ($manifest.sha256) { $manifest.sha256 } else { $manifest.checksum })).ToLowerInvariant()
  $expectedSize = [int64]$(if ($manifest.size) { $manifest.size } elseif ($manifest.zipSize) { $manifest.zipSize } else { $manifest.fileSize })
  if ($version -ne $expectedVersion) { throw "Server version mismatch: expected $expectedVersion, found $version" }
  if ($downloadUrl -notmatch '^https://') { throw "downloadUrl is not public HTTPS: $downloadUrl" }
  if ($downloadUrl -match 'localhost|127\.0\.0\.1|192\.168\.|10\.') { throw "downloadUrl is not public: $downloadUrl" }
  if ($expectedSha -notmatch '^[a-f0-9]{64}$') { throw "Manifest SHA-256 is invalid" }
  if ($expectedSize -le 0) { throw "Manifest package size is invalid" }

  Invoke-WebRequest -Uri $downloadUrl -OutFile $package -UseBasicParsing
  $actualSize = (Get-Item -LiteralPath $package).Length
  $actualSha = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualSize -ne $expectedSize) { throw "Downloaded size mismatch: $actualSize/$expectedSize" }
  if ($actualSha -ne $expectedSha) { throw "Downloaded SHA-256 mismatch: $actualSha/$expectedSha" }

  Expand-Archive -LiteralPath $package -DestinationPath $extracted -Force
  $clientRoot = Join-Path $extracted "client"
  $releaseManifestPath = Join-Path $clientRoot "release-manifest.json"
  if (!(Test-Path -LiteralPath $releaseManifestPath)) { throw "release-manifest.json is missing" }
  $releaseManifest = Get-Content -LiteralPath $releaseManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($releaseManifest.packageType -ne "full-client") { throw "Package is not full-client" }
  if ($releaseManifest.version -ne $expectedVersion) { throw "Package manifest version mismatch" }
  $packageExe = Get-Item -LiteralPath (Join-Path $clientRoot "BaiqiuAI.exe")
  if ($packageExe.VersionInfo.ProductVersion -ne $expectedVersion) { throw "Package EXE version mismatch: $($packageExe.VersionInfo.ProductVersion)" }
  if ((Get-FileHash -LiteralPath $packageExe.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $releaseManifest.executable.sha256) { throw "Package EXE hash mismatch" }

  $helper = Join-Path $PSScriptRoot "ci-public-update-updater.js"
  $prepared = (& node $helper $package $clientRoot $testRoot | ConvertFrom-Json)
  $env:BAIQIU_DATA_ROOT = $prepared.userDataPath
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $prepared.scriptPath
  if ($LASTEXITCODE -ne 0) { throw "Generated updater exited with $LASTEXITCODE" }

  $state = Get-Content -LiteralPath $prepared.statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  $installedVersion = (Get-Content -LiteralPath (Join-Path $prepared.installRoot "resources\app\version.json") -Raw -Encoding UTF8 | ConvertFrom-Json).appVersion
  $installedExe = Get-Item -LiteralPath (Join-Path $prepared.installRoot "BaiqiuAI.exe")
  $installedExeSha = (Get-FileHash -LiteralPath $installedExe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($state.status -ne "completed") { throw "Updater state is not completed: $($state.status) $($state.error)" }
  if ($installedVersion -ne $expectedVersion) { throw "Installed resources version mismatch: $installedVersion" }
  if ($installedExe.VersionInfo.ProductVersion -ne $expectedVersion) { throw "Installed EXE version mismatch: $($installedExe.VersionInfo.ProductVersion)" }
  if ($installedExeSha -ne $releaseManifest.executable.sha256) { throw "Installed EXE hash mismatch" }
  if (Test-Path -LiteralPath (Join-Path $prepared.installRoot "obsolete-runtime.dll")) { throw "Obsolete runtime file was not removed" }
  if ((Get-Content -LiteralPath (Join-Path $prepared.userDataPath "keep-me.txt") -Raw) -ne "preserved-user-data") { throw "User data was not preserved" }

  $started = $false
  for ($i = 0; $i -lt 20; $i += 1) {
    $started = @(Get-CimInstance Win32_Process -Filter "Name='BaiqiuAI.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -eq $installedExe.FullName }).Count -gt 0
    if ($started) { break }
    Start-Sleep -Milliseconds 500
  }
  if (!$started) { throw "Updated BaiqiuAI.exe did not restart" }

  $result = [ordered]@{
    runner = $env:RUNNER_NAME
    manifestSource = $manifestSource
    canonicalLatest = $canonicalLatest
    currentVersion = "2.1.0"
    serverVersion = $version
    detection = "PASS"
    download = "PASS"
    checksum = "PASS"
    install = "PASS"
    restart = "PASS"
    exeUpdate = "PASS"
    resourcesUpdate = "PASS"
    userDataPreserved = "PASS"
    packageBytes = $actualSize
    packageSha256 = $actualSha
    exeSha256 = $installedExeSha
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $work "acceptance-result.json") -Encoding UTF8
  $result | ConvertTo-Json -Depth 5

  if ($env:GITHUB_STEP_SUMMARY) {
    @"
## Baiqiu AI public update acceptance

| Check | Result |
| --- | --- |
| Official latest.json | $(if ($canonicalLatest) { "PASS" } else { "FAIL (fallback update.json used)" }) |
| Detection | PASS |
| Download | PASS |
| SHA-256 / size | PASS |
| Install replacement | PASS |
| Restart | PASS |
| EXE 2.1.1 | PASS |
| resources 2.1.1 | PASS |
| User data preserved | PASS |

Package SHA-256: ``$actualSha``
"@ | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding UTF8
  }
} finally {
  Get-Process -Name "BaiqiuAI" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
