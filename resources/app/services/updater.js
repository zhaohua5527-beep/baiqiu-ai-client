const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const crypto = require("node:crypto");
const { app } = require("electron");

class Updater {
  constructor(options = {}) {
    this.updateServer = options.updateServer || "http://localhost:3000";
    this.currentVersion = options.currentVersion || app.getVersion();
    this.checkInterval = options.checkInterval || 24 * 60 * 60 * 1000;
    this.downloadDir = options.downloadDir || path.join(app.getPath("userData"), "updates");
    this.statePath = options.statePath || path.join(this.downloadDir, "update-state.json");
  }

  async checkForUpdate(inviteCode) {
    try {
      const version = encodeURIComponent(this.currentVersion);
      const code = encodeURIComponent(String(inviteCode || ""));
      const response = await this._request("GET", `/api/update/check?version=${version}&inviteCode=${code}`);
      if (response?.hasUpdate) {
        return {
          hasUpdate: true,
          latestVersion: response.latestVersion,
          releaseNotes: response.releaseNotes,
          downloadUrl: response.downloadUrl,
          fileSize: response.fileSize,
          checksum: response.checksum
        };
      }
      return {
        hasUpdate: false,
        latestVersion: response?.latestVersion || this.currentVersion,
        releaseNotes: response?.releaseNotes || "",
        message: response?.message || "当前已经是最新版本。"
      };
    } catch (error) {
      console.error("[Updater] 检查更新失败", error.message || error);
      return { hasUpdate: false, error: error.message || String(error) };
    }
  }

  async downloadUpdate(downloadUrl, checksum, onProgress) {
    if (!downloadUrl) throw new Error("缺少更新包下载地址");
    fs.mkdirSync(this.downloadDir, { recursive: true });
    const filePath = path.join(this.downloadDir, "update.zip");
    fs.rmSync(filePath, { force: true });

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      const request = this._protocol(downloadUrl).get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close(() => {
            fs.unlink(filePath, () => {});
            this.downloadUpdate(new URL(response.headers.location, downloadUrl).toString(), checksum, onProgress).then(resolve, reject);
          });
          return;
        }
        if (response.statusCode !== 200) {
          file.close(() => fs.unlink(filePath, () => {}));
          reject(new Error(`涓嬭浇澶辫触锛欻TTP ${response.statusCode}`));
          return;
        }

        const totalSize = Number(response.headers["content-length"] || 0);
        let downloadedSize = 0;
        response.on("data", (chunk) => {
          downloadedSize += chunk.length;
          if (onProgress && totalSize > 0) onProgress(Math.round((downloadedSize / totalSize) * 100));
        });
        response.pipe(file);

        file.on("finish", () => {
          file.close(async () => {
            try {
              if (checksum) await this.verifyChecksum(filePath, checksum);
              resolve(filePath);
            } catch (error) {
              fs.unlink(filePath, () => {});
              reject(error);
            }
          });
        });
      });

      request.on("error", (error) => {
        file.close(() => fs.unlink(filePath, () => {}));
        reject(error);
      });
    });
  }

  verifyChecksum(filePath, checksum) {
    const expected = String(checksum || "").replace(/^sha256:/i, "").toLowerCase();
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        const actual = hash.digest("hex").toLowerCase();
        if (expected && actual !== expected) {
          reject(new Error("文件校验失败，下载文件可能已损坏。"));
          return;
        }
        resolve(actual);
      });
    });
  }

  async applyUpdate(zipFilePath, options = {}) {
    if (!zipFilePath || !fs.existsSync(zipFilePath)) throw new Error("鏇存柊鍖呬笉瀛樺湪");
    const tempUpdatePath = path.join(this.downloadDir, "temp-update");
    const currentExe = app.getPath("exe");
    const appPath = path.dirname(currentExe);
    const backupPath = path.join(this.downloadDir, "backup");
    const scriptPath = path.join(this.downloadDir, "update.ps1");
    const versionLockPath = path.join(this.downloadDir, "version-lock.json");
    const logPath = path.join(this.downloadDir, "logs", `installer-${Date.now()}.log`);
    const pid = process.pid;
    const targetVersion = String(options.version || "");

    fs.rmSync(tempUpdatePath, { recursive: true, force: true });
    fs.mkdirSync(tempUpdatePath, { recursive: true });

    const script = [
      "$ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
      `$package = ${JSON.stringify(zipFilePath)}`,
      `$tempUpdate = ${JSON.stringify(tempUpdatePath)}`,
      `$target = ${JSON.stringify(appPath)}`,
      `$backup = ${JSON.stringify(backupPath)}`,
      `$exe = ${JSON.stringify(currentExe)}`,
      `$stateFile = ${JSON.stringify(this.statePath)}`,
      `$versionLockFile = ${JSON.stringify(versionLockPath)}`,
      `$logFile = ${JSON.stringify(logPath)}`,
      `$targetVersion = ${JSON.stringify(targetVersion)}`,
      `$pidToWait = ${JSON.stringify(pid)}`,
      "function Write-UpdateState([string]$status, [string]$errorMessage = '') {",
      "  $dir = Split-Path -Parent $stateFile",
      "  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }",
      "  $state = @{ state = $status; status = $status; version = $targetVersion; newVersion = $targetVersion; lastUpdate = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); scriptPath = $PSCommandPath; packagePath = $package; backupPath = $backup; appPath = $target; error = $errorMessage }",
      "  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $stateFile -Encoding UTF8",
      "}",
      "function Write-InstallerLog([string]$message) {",
      "  $dir = Split-Path -Parent $logFile",
      "  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }",
      "  ('[' + (Get-Date).ToString('o') + '] ' + $message) | Add-Content -LiteralPath $logFile -Encoding UTF8",
      "}",
      "function Write-VersionLock {",
      "  $dir = Split-Path -Parent $versionLockFile",
      "  if (!(Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }",
      "  @{ version = $targetVersion; status = 'done'; lastUpdate = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $versionLockFile -Encoding UTF8",
      "}",
      "function Invoke-SafeRobocopy([string]$source, [string]$dest) {",
      "  robocopy $source $dest /MIR /R:2 /W:1 /XD temp-update backup updates /XF update.ps1 update-state.json | Out-Null",
      "  $code = $LASTEXITCODE",
      "  if ($code -ge 8) { throw \"Robocopy failed with exit code $code\" }",
      "}",
      "try {",
      "  Write-UpdateState 'switching'",
      "  Write-InstallerLog 'switching started'",
      "  Start-Sleep -Seconds 3",
      "  try { Wait-Process -Id $pidToWait -Timeout 60 -ErrorAction SilentlyContinue } catch {}",
      "  if (!(Test-Path -LiteralPath $package)) { throw 'Update package not found.' }",
      "  if ((Get-Item -LiteralPath $package).Length -le 0) { throw 'Update package is empty.' }",
      "  if (Test-Path $tempUpdate) { Remove-Item $tempUpdate -Recurse -Force }",
      "  New-Item -ItemType Directory -Force -Path $tempUpdate | Out-Null",
      "  Write-UpdateState 'verifying'",
      "  Expand-Archive -LiteralPath $package -DestinationPath $tempUpdate -Force",
      "  $clientPath = Join-Path $tempUpdate 'client'",
      "  if (Test-Path -LiteralPath $clientPath) { $sourcePath = $clientPath } else {",
      "    $source = Get-ChildItem $tempUpdate -Directory | Select-Object -First 1",
      "    if ($source) { $sourcePath = $source.FullName } else { $sourcePath = $tempUpdate }",
      "  }",
      "  $fileCount = (Get-ChildItem -LiteralPath $sourcePath -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count",
      "  if ($fileCount -lt 10) { throw 'Update package file count is too small.' }",
      "  if (!(Test-Path -LiteralPath (Join-Path $sourcePath 'resources\\app\\main.js')) -and !(Test-Path -LiteralPath (Join-Path $sourcePath 'main.js'))) { throw 'Update package missing main entry.' }",
      "  if ((Test-Path -LiteralPath (Join-Path $sourcePath 'BaiqiuAI.exe')) -eq $false -and (Test-Path -LiteralPath (Join-Path $sourcePath 'electron.exe')) -eq $false -and (Test-Path -LiteralPath (Join-Path $target 'BaiqiuAI.exe'))) { throw 'Update package missing executable.' }",
      "  if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }",
      "  New-Item -ItemType Directory -Force -Path $backup | Out-Null",
      "  Invoke-SafeRobocopy $target $backup",
      "  Write-InstallerLog 'backup complete'",
      "  Invoke-SafeRobocopy $sourcePath $target",
      "  Write-UpdateState 'testing'",
      "  if (!(Test-Path -LiteralPath (Join-Path $target 'resources\\app\\main.js')) -and !(Test-Path -LiteralPath (Join-Path $target 'main.js'))) { throw 'Updated app missing main entry after replace.' }",
      "  Write-VersionLock",
      "  Write-UpdateState 'completed'",
      "  Write-InstallerLog 'completed'",
      "  Start-Process -FilePath $exe",
      "} catch {",
      "  $message = $_.Exception.Message",
      "  Write-InstallerLog ('rollback: ' + $message)",
      "  try { if ((Test-Path $backup) -and (Test-Path $target)) { Invoke-SafeRobocopy $backup $target } } catch {}",
      "  try { if (Test-Path -LiteralPath $package) { Remove-Item -LiteralPath $package -Force } } catch {}",
      "  Write-UpdateState 'rollback' $message",
      "  try { Start-Process -FilePath $exe } catch {}",
      "}"
    ].join("\r\n");
    fs.writeFileSync(scriptPath, script, "utf8");

    return {
      success: true,
      zipFilePath,
      tempUpdatePath,
      appPath,
      backupPath,
      scriptPath,
      statePath: this.statePath,
      message: "更新包已准备，白球即将安全退出并应用更新。"
    };
  }

  _request(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.updateServer);
      const data = body ? JSON.stringify(body) : "";
      const options = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      };

      const req = this._protocol(url.toString()).request(options, (res) => {
        let responseBody = "";
        res.on("data", (chunk) => { responseBody += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${responseBody.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(responseBody || "{}"));
          } catch {
            resolve(responseBody);
          }
        });
      });

      req.on("error", reject);
      if (data) req.write(data);
      req.end();
    });
  }

  _protocol(url) {
    return String(url || "").startsWith("https:") ? https : http;
  }
}

module.exports = Updater;

