# Infrastructure Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Windows MSI build failure, add platform-specific Tauri configs, add nightly build channel, automate release notes, add Makefile, optimize release binary size, and document updater signing key setup.

**Architecture:** Split `tauri.conf.json` into base + platform overrides. Fix WiX version encoding. Add nightly workflow that builds from `develop` on cron + manual dispatch with separate app identity. Add release-drafter for changelogs. Optimize Cargo release profile.

**Tech Stack:** Tauri 2, GitHub Actions, WiX MSI, release-drafter, Make

**Working directory:** `/Users/longdao/Projects/OpenACP-App-group2/` (worktree on `feat/infra-update`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `.github/workflows/release.yml` | Modify | Fix WiX version math in stable release workflow |
| `src-tauri/tauri.conf.json` | Modify | Base config — shared settings, remove platform-specific fields |
| `src-tauri/tauri.macos.conf.json` | Create | macOS: titlebar overlay, transparent, dmg target |
| `src-tauri/tauri.windows.conf.json` | Create | Windows: no decorations, nsis target, webview install |
| `src-tauri/tauri.linux.conf.json` | Create | Linux: deb + appimage targets |
| `src-tauri/Cargo.toml` | Modify | Add `[profile.release]` optimization |
| `.github/workflows/nightly.yml` | Create | Nightly build workflow (cron Mon-Fri + manual dispatch) |
| `scripts/set-channel.sh` | Create | Script to switch app identity between stable/nightly |
| `src-tauri/icons/nightly/` | Create | Nightly icon directory (placeholder, same icons initially) |
| `.github/release-drafter.yml` | Create | Release drafter config |
| `.github/workflows/release-drafter.yml` | Create | Workflow for release-drafter |
| `Makefile` | Create | Common dev/build/release tasks |
| `scripts/release.sh` | Modify | Sync version to Cargo.toml |

---

### Task 1: Fix Windows MSI WiX Version Encoding

The current WiX version calculation produces `YY.MDD.N` (e.g. `26.403.1`) — but WiX requires major/minor both ≤ 255, and MDD can be up to 1231. Fix by encoding as `YY.M.(DD*100+N)` where build component (≤ 65535) absorbs day + patch.

**Files:**
- Modify: `.github/workflows/release.yml:86-114`

- [ ] **Step 1: Fix the WiX version calculation in the sync-version step**

Replace the sync version step in `.github/workflows/release.yml` with:

```yaml
      - name: Sync version
        shell: bash
        run: |
          VERSION="${{ needs.create-release.outputs.version }}"
          echo "Version: $VERSION"

          node -e "
            const fs = require('fs');
            const v = '$VERSION';
            const parts = v.split('.');
            const yyyy = parseInt(parts[0]);
            const mdd = parts[1];
            const n = parseInt(parts[2] || '1');

            // WiX MSI: major ≤ 255, minor ≤ 255, build ≤ 65535.
            // YYYY.MDD.N → YY.M.(DD * 100 + N)
            // e.g. 2026.403.1 → 26.4.301, 2026.1231.5 → 26.12.3105
            const yy = yyyy % 100;
            const m = parseInt(mdd.length <= 3 ? mdd.slice(0, -2) : mdd.slice(0, -2));
            const dd = parseInt(mdd.slice(-2));
            const wixVersion = yy + '.' + m + '.' + (dd * 100 + n);

            // package.json
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            pkg.version = v;
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

            // tauri.conf.json — set WiX version override
            const conf = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
            if (!conf.bundle) conf.bundle = {};
            if (!conf.bundle.windows) conf.bundle.windows = {};
            if (!conf.bundle.windows.wix) conf.bundle.windows.wix = {};
            conf.bundle.windows.wix.version = wixVersion;
            fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');

            // Cargo.toml
            let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
            cargo = cargo.replace(/^version = \".*\"/m, 'version = \"' + v + '\"');
            fs.writeFileSync('src-tauri/Cargo.toml', cargo);

            console.log('App version:', v, '| WiX:', wixVersion);
          "
```

Key change: `YY.M.(DD*100+N)` instead of `YY.MDD.N` — guarantees minor ≤ 12 and build ≤ 3199.

Edge cases:
- `2026.403.1` → `26.4.301` (minor=4 ≤ 255, build=301 ≤ 65535)
- `2026.1231.9` → `26.12.3109` (minor=12 ≤ 255, build=3109 ≤ 65535)
- `2027.101.15` → `27.1.115` (minor=1 ≤ 255, build=115 ≤ 65535)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "fix(ci): WiX version encoding — YY.M.(DD*100+N) keeps all components within limits"
```

---

### Task 2: Platform-Specific Tauri Configs

Split platform-specific concerns from base config. Tauri 2 auto-merges `tauri.{platform}.conf.json` when building for that platform.

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/tauri.macos.conf.json`
- Create: `src-tauri/tauri.windows.conf.json`
- Create: `src-tauri/tauri.linux.conf.json`

- [ ] **Step 1: Update base tauri.conf.json — remove platform-specific bundle targets**

Replace the `bundle` section:

```json
  "bundle": {
    "createUpdaterArtifacts": "v2Compatible",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "active": true
  }
```

(Removed `"targets": "all"` — platform configs specify targets.)

- [ ] **Step 2: Create `src-tauri/tauri.macos.conf.json`**

```json
{
  "app": {
    "windows": [
      {
        "titleBarStyle": "Overlay",
        "hiddenTitle": true,
        "transparent": true,
        "decorations": true
      }
    ]
  },
  "bundle": {
    "targets": ["dmg"]
  }
}
```

- [ ] **Step 3: Create `src-tauri/tauri.windows.conf.json`**

```json
{
  "app": {
    "windows": [
      {
        "decorations": false,
        "transparent": false
      }
    ]
  },
  "bundle": {
    "targets": ["nsis"],
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper",
        "silent": true
      }
    }
  }
}
```

- [ ] **Step 4: Create `src-tauri/tauri.linux.conf.json`**

```json
{
  "app": {
    "windows": [
      {
        "transparent": false,
        "decorations": true
      }
    ]
  },
  "bundle": {
    "targets": ["deb", "appimage"]
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/tauri.macos.conf.json src-tauri/tauri.windows.conf.json src-tauri/tauri.linux.conf.json
git commit -m "feat(tauri): platform-specific configs for macOS, Windows, and Linux"
```

---

### Task 3: Optimize Cargo Release Profile

Add aggressive size optimizations for release builds.

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Append release profile to Cargo.toml**

Add at end of `src-tauri/Cargo.toml`:

```toml

[profile.release]
opt-level = "z"          # Optimize for binary size
lto = "fat"              # Full link-time optimization
strip = "symbols"        # Strip debug symbols
codegen-units = 1        # Single codegen unit for better optimization
panic = "abort"          # No stack unwinding overhead
incremental = false      # Deterministic release builds
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "perf(tauri): optimize release profile — fat LTO, size opt, symbol strip"
```

---

### Task 4: Nightly Build Channel

Add a nightly workflow that builds from `develop` on a cron schedule (Mon-Fri 2AM GMT+7) and on manual dispatch. Uses a separate app identity so it can be installed alongside stable.

**Files:**
- Create: `scripts/set-channel.sh`
- Create: `.github/workflows/nightly.yml`
- Create: `src-tauri/icons/nightly/.gitkeep`

- [ ] **Step 1: Create `scripts/set-channel.sh`**

This script patches `tauri.conf.json` and `Cargo.toml` to switch between stable and nightly identity. CI calls it before building nightly.

```bash
#!/usr/bin/env bash
# Switch app identity for channel builds.
# Usage: ./scripts/set-channel.sh nightly
#        ./scripts/set-channel.sh stable   (no-op, default state)

set -euo pipefail

CHANNEL="${1:-stable}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$CHANNEL" == "stable" ]]; then
  echo "Channel: stable (default, no changes needed)"
  exit 0
fi

echo "Switching to channel: $CHANNEL"

# ── Patch tauri.conf.json ──
node -e "
  const fs = require('fs');
  const conf = JSON.parse(fs.readFileSync('$ROOT/src-tauri/tauri.conf.json', 'utf8'));

  conf.productName = 'OpenACP ' + '$CHANNEL'.charAt(0).toUpperCase() + '$CHANNEL'.slice(1);
  conf.identifier = 'com.openacp.desktop.$CHANNEL';

  // Disable auto-updater for non-stable channels
  if (conf.plugins && conf.plugins.updater) {
    delete conf.plugins.updater;
  }
  // No updater artifacts needed
  if (conf.bundle) {
    delete conf.bundle.createUpdaterArtifacts;
  }

  // Use nightly icons if they exist (fall back to default)
  const nightlyIconDir = '$ROOT/src-tauri/icons/$CHANNEL';
  const hasNightlyIcons = fs.existsSync(nightlyIconDir + '/icon.icns');
  if (hasNightlyIcons) {
    conf.bundle.icon = [
      'icons/$CHANNEL/32x32.png',
      'icons/$CHANNEL/128x128.png',
      'icons/$CHANNEL/128x128@2x.png',
      'icons/$CHANNEL/icon.icns',
      'icons/$CHANNEL/icon.ico'
    ];
  }

  fs.writeFileSync('$ROOT/src-tauri/tauri.conf.json', JSON.stringify(conf, null, 2) + '\n');
  console.log('  tauri.conf.json → ' + conf.productName + ' (' + conf.identifier + ')');
  console.log('  Icons: ' + (hasNightlyIcons ? '$CHANNEL' : 'default (no $CHANNEL icons found)'));
  console.log('  Updater: disabled');
"

# ── Patch Cargo.toml — update package name for unique binary ──
sed -i.bak "s/^name = \"openacp-desktop\"/name = \"openacp-desktop-$CHANNEL\"/" "$ROOT/src-tauri/Cargo.toml"
rm -f "$ROOT/src-tauri/Cargo.toml.bak"
echo "  Cargo.toml → openacp-desktop-$CHANNEL"

echo "Done. Build will produce: OpenACP ${CHANNEL^}"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/set-channel.sh
```

- [ ] **Step 3: Create nightly icon placeholder directory**

```bash
mkdir -p src-tauri/icons/nightly
```

Create `src-tauri/icons/nightly/.gitkeep` (empty file) so the directory is tracked. When designer provides nightly icons, drop them here with the same names as `icons/` (32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico).

- [ ] **Step 4: Create `.github/workflows/nightly.yml`**

```yaml
name: Nightly Build

on:
  schedule:
    - cron: "0 19 * * 1-5"  # 2AM GMT+7 (7PM UTC), Mon-Fri
  workflow_dispatch:          # Manual trigger — always builds, skips commit check

permissions:
  contents: read
  actions: write

env:
  PNPM_VERSION: 9

jobs:
  # ── Gate: skip if no new commits (cron only, manual always builds) ──
  check:
    runs-on: ubuntu-latest
    outputs:
      should_build: ${{ steps.check.outputs.should_build }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop
          fetch-depth: 0

      - name: Check for recent commits
        id: check
        run: |
          if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
            echo "Manual trigger — always build."
            echo "should_build=true" >> $GITHUB_OUTPUT
            exit 0
          fi
          RECENT=$(git log --since="24 hours ago" --oneline origin/develop | head -1)
          if [[ -z "$RECENT" ]]; then
            echo "No new commits in the last 24 hours. Skipping."
            echo "should_build=false" >> $GITHUB_OUTPUT
          else
            echo "New commits found: $RECENT"
            echo "should_build=true" >> $GITHUB_OUTPUT
          fi

  # ── Build matrix (only if check passes) ──
  nightly:
    needs: check
    if: needs.check.outputs.should_build == 'true'
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: --target aarch64-apple-darwin
            rust_target: aarch64-apple-darwin
          - platform: macos-latest
            args: --target x86_64-apple-darwin
            rust_target: x86_64-apple-darwin
          - platform: ubuntu-22.04
            args: ""
            rust_target: x86_64-unknown-linux-gnu
          - platform: windows-latest
            args: ""
            rust_target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: develop

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.rust_target }}

      - name: Install Linux dependencies
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Set nightly version
        shell: bash
        run: |
          LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
          VERSION="${LATEST_TAG#v}"
          NIGHTLY_VERSION="${VERSION}-nightly.$(date +%Y%m%d)"
          echo "Nightly version: $NIGHTLY_VERSION"

          node -e "
            const fs = require('fs');
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            pkg.version = '$NIGHTLY_VERSION';
            fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
          "

          sed -i.bak "s/^version = \".*\"/version = \"0.0.0\"/" src-tauri/Cargo.toml
          rm -f src-tauri/Cargo.toml.bak

      - name: Switch to nightly channel
        shell: bash
        run: ./scripts/set-channel.sh nightly

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          args: ${{ matrix.args }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: nightly-${{ matrix.platform }}-${{ matrix.rust_target }}
          path: |
            src-tauri/target/**/release/bundle/**/*.dmg
            src-tauri/target/**/release/bundle/**/*.exe
            src-tauri/target/**/release/bundle/**/*.deb
            src-tauri/target/**/release/bundle/**/*.AppImage
          retention-days: 14
          if-no-files-found: error
```

Key design decisions:
- **2-job structure**: `check` job (ubuntu, ~10s) gates `nightly` job. No new commits on `develop` in 24h → entire matrix is skipped. `workflow_dispatch` always builds.
- Builds from `develop` branch, not `main`
- Uses `set-channel.sh nightly` to switch identity (name, identifier, disable updater)
- No signing — nightly builds are unsigned (testers accept the risk)
- Artifacts uploaded to GitHub Actions (14-day retention, free, no S3 needed)
- Version: `{latest_tag}-nightly.{YYYYMMDD}` (Cargo.toml gets `0.0.0` placeholder since Cargo doesn't support prerelease suffixes)
- No GitHub Release created — artifacts only from Actions tab

- [ ] **Step 5: Commit**

```bash
git add scripts/set-channel.sh .github/workflows/nightly.yml src-tauri/icons/nightly/.gitkeep
git commit -m "feat(ci): add nightly build channel — cron Mon-Fri 2AM GMT+7, separate app identity"
```

---

### Task 5: Add Release Drafter for Automated Release Notes

PRs with labels auto-populate a running release draft. Maintainer reviews before tagging.

**Files:**
- Create: `.github/release-drafter.yml`
- Create: `.github/workflows/release-drafter.yml`

- [ ] **Step 1: Create `.github/release-drafter.yml` config**

```yaml
name-template: "OpenACP Desktop $RESOLVED_VERSION"
tag-template: "v$RESOLVED_VERSION"

categories:
  - title: "Features"
    labels:
      - "feat"
      - "feature"
      - "enhancement"
  - title: "Bug Fixes"
    labels:
      - "fix"
      - "bug"
  - title: "Performance"
    labels:
      - "perf"
      - "performance"
  - title: "Maintenance"
    labels:
      - "chore"
      - "ci"
      - "docs"
      - "refactor"

change-template: "- $TITLE (#$NUMBER)"
change-title-escapes: '\<*_&'

no-changes-template: "No notable changes."

template: |
  ## What's Changed

  $CHANGES

  **Full Changelog**: https://github.com/$OWNER/$REPOSITORY/compare/$PREVIOUS_TAG...v$RESOLVED_VERSION
```

- [ ] **Step 2: Create `.github/workflows/release-drafter.yml` workflow**

```yaml
name: Release Drafter

on:
  push:
    branches:
      - main
      - develop
  pull_request_target:
    types: [opened, reopened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  update-release-draft:
    runs-on: ubuntu-latest
    steps:
      - uses: release-drafter/release-drafter@v6
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Note: The stable release workflow keeps `generate_release_notes: true` as-is. Release-drafter creates a separate running draft on the Releases page that maintainer can review/edit before tagging. Both coexist — drafter is the preview, tag-triggered workflow creates the actual release.

- [ ] **Step 3: Commit**

```bash
git add .github/release-drafter.yml .github/workflows/release-drafter.yml
git commit -m "feat(ci): add release-drafter for automated release notes from PR labels"
```

---

### Task 6: Add Makefile for Common Tasks

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Create `Makefile`**

```makefile
.PHONY: dev build tauri-dev tauri-build install clean release release-dry lint

# ── Development ──

install:
	pnpm install

dev:
	pnpm dev

tauri-dev:
	pnpm tauri dev

# ── Build ──

build:
	pnpm build

tauri-build:
	pnpm tauri build

# ── Release ──

release:
	./scripts/release.sh

release-dry:
	./scripts/release.sh --dry

# ── Maintenance ──

clean:
	rm -rf dist node_modules/.vite
	cd src-tauri && cargo clean

lint:
	pnpm tsc --noEmit
```

- [ ] **Step 2: Commit**

```bash
git add Makefile
git commit -m "chore: add Makefile for common dev/build/release tasks"
```

---

### Task 7: Fix release.sh to Sync Cargo.toml Version

**Files:**
- Modify: `scripts/release.sh`

- [ ] **Step 1: Add Cargo.toml version sync after package.json sync**

After the `node -e` block that updates package.json (line ~82), add:

```bash
# Sync version in Cargo.toml
sed -i.bak "s/^version = \".*\"/version = \"${NEXT}\"/" src-tauri/Cargo.toml
rm -f src-tauri/Cargo.toml.bak
echo "  Cargo.toml → ${NEXT}"
```

- [ ] **Step 2: Update the git add line to include Cargo.toml**

Change:
```bash
git add package.json
```
to:
```bash
git add package.json src-tauri/Cargo.toml
```

- [ ] **Step 3: Commit**

```bash
git add scripts/release.sh
git commit -m "fix(release): sync version to Cargo.toml alongside package.json"
```

---

### Task 8: Document Updater Signing Key Setup

Auto-updater code is complete but `pubkey` is empty and GitHub secrets aren't set. This task is mostly manual (one-time setup).

**Files:**
- Modify: `src-tauri/tauri.conf.json:34` (pubkey — after key generation)

- [ ] **Step 1: Generate signing keypair (manual, run locally)**

```bash
pnpm tauri signer generate -w ~/.tauri/openacp.key
```

Produces:
- `~/.tauri/openacp.key` — private key (NEVER commit)
- Prints **public key** to stdout — copy it

- [ ] **Step 2: Set the public key in tauri.conf.json**

Replace empty `pubkey` in `src-tauri/tauri.conf.json`:

```json
  "plugins": {
    "updater": {
      "pubkey": "<PASTE_PUBLIC_KEY_HERE>",
      ...
    }
  },
```

- [ ] **Step 3: Add GitHub repo secrets (manual)**

Go to `https://github.com/Open-ACP/OpenACP-App/settings/secrets/actions` and add:

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/openacp.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password used during generation |

- [ ] **Step 4: Commit pubkey change**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(updater): add signing public key for auto-update verification"
```

- [ ] **Step 5: Verify after next tagged release**

Check GitHub release assets for: `latest.json`, `*.sig` files. If present, auto-updater works end-to-end.

---

## Summary

| Task | What | Impact |
|------|------|--------|
| 1. WiX version | Fix `YY.M.(DD*100+N)` encoding | **Critical** — unblocks Windows CI |
| 2. Platform configs | macOS/Windows/Linux split | Better per-platform UX |
| 3. Release profile | Fat LTO, size opt, strip | Smaller binaries (~30-50%) |
| 4. Nightly channel | Cron build from `develop`, separate identity | Internal testing without manual builds |
| 5. Release drafter | Auto-gen notes from PR labels | No more manual release editing |
| 6. Makefile | `make dev`, `make build`, etc. | DX improvement |
| 7. release.sh fix | Sync Cargo.toml version | Consistent local builds |
| 8. Updater signing | Generate keys, set pubkey + secrets | **Required** for OTA updates |
