const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

class IntegrityChecker {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.manifestPath = options.manifestPath || path.join(this.rootDir, "integrity-manifest.json");
    this.files = options.files || ["main.js", "preload.js", "tool-registry.js", "tool-loader.js"];
  }

  hashFile(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(this.rootDir, file))).digest("hex");
  }

  createManifest() {
    const manifest = {
      createdAt: new Date().toISOString(),
      files: Object.fromEntries(this.files.filter((file) => fs.existsSync(path.join(this.rootDir, file))).map((file) => [file, this.hashFile(file)]))
    };
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    return manifest;
  }

  verify() {
    if (!fs.existsSync(this.manifestPath)) {
      return { ok: true, created: true, manifest: this.createManifest(), issues: [] };
    }
    const manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
    const issues = [];
    for (const [file, expected] of Object.entries(manifest.files || {})) {
      const full = path.join(this.rootDir, file);
      if (!fs.existsSync(full)) {
        issues.push({ file, reason: "missing" });
        continue;
      }
      const actual = this.hashFile(file);
      if (actual !== expected) issues.push({ file, reason: "hash_mismatch", expected, actual });
    }
    return { ok: issues.length === 0, created: false, issues };
  }
}

module.exports = IntegrityChecker;
