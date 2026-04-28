# Plan 1 of 7 — Extension URI Scheme & Bundle Resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `openacp-ext://<extId>/<path>` Tauri custom URI scheme so an extension bundle placed on disk can be served to an iframe with proper CSP headers and bullet-proof path traversal protection. After this plan, you can manually drop an extension folder under `$APPDATA/extensions/<extId>/` and load `dist/main.js` or `dist/ui/<panelId>.html` from an iframe `src=`.

**Architecture:** New Rust module `src-tauri/src/core/extensions/` containing path helpers, a minimal `extension.json` reader, and an async URI scheme handler. The scheme handler is registered on the Tauri builder in `src-tauri/src/lib.rs`. No frontend code, no JS API, no host bridge — those land in plans 2 and 3.

**Tech Stack:** Rust 2024 (already in `src-tauri/Cargo.toml`), Tauri 2 async URI scheme protocol, `tokio::fs`, `serde_json`, `dirs` (already a dep), inline `#[cfg(test)]` modules with `#[tokio::test]`. Hardcoded MIME mapping (avoid adding `mime_guess` for our small file-type set).

**Spec:** `docs/superpowers/specs/2026-04-28-extension-runtime-bridge-design.md` sections 3, 4, 5 (`src-tauri/src/core/extensions/` rows: `mod.rs`, `scheme.rs`, `paths.rs`, `manifest.rs`).

---

## File structure

| File | Responsibility |
|---|---|
| `src-tauri/src/core/extensions/mod.rs` | Module root, re-exports |
| `src-tauri/src/core/extensions/paths.rs` | `$APPDATA/extensions/<extId>/` resolution, traversal-safe joining |
| `src-tauri/src/core/extensions/manifest.rs` | `MinimalManifest` struct + JSON reader |
| `src-tauri/src/core/extensions/scheme.rs` | Async URI scheme handler |
| `src-tauri/src/core/mod.rs` | Modify: add `pub mod extensions;` |
| `src-tauri/src/lib.rs` | Modify: register scheme on the Tauri builder |

Tests live inline in each file under `#[cfg(test)] mod tests`.

---

## Task 1 — Module skeleton

**Files:**
- Create: `src-tauri/src/core/extensions/mod.rs`
- Modify: `src-tauri/src/core/mod.rs`

- [ ] **Step 1: Create the module file**

```rust
// src-tauri/src/core/extensions/mod.rs
pub mod manifest;
pub mod paths;
pub mod scheme;
```

- [ ] **Step 2: Wire it into the core module**

Modify `src-tauri/src/core/mod.rs`. Add the line in alphabetical position:

```rust
pub mod browser;
pub mod extensions;
pub mod filesystem;
pub mod keychain;
pub mod logging;
pub mod onboarding;
pub mod pty;
pub mod shell_env;
pub mod sidecar;
```

- [ ] **Step 3: Create empty submodule files so the module compiles**

```rust
// src-tauri/src/core/extensions/paths.rs
// Empty; populated in Task 2.
```

```rust
// src-tauri/src/core/extensions/manifest.rs
// Empty; populated in Task 3.
```

```rust
// src-tauri/src/core/extensions/scheme.rs
// Empty; populated in Task 4.
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: clean compile, possibly with `unused` warnings on the empty modules.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/ src-tauri/src/core/mod.rs
git commit -m "feat(extensions): add core::extensions module skeleton"
```

---

## Task 2 — Extension root path resolution

**Files:**
- Modify: `src-tauri/src/core/extensions/paths.rs`

The path resolver returns `<APPDATA>/extensions/<extId>/`. `extId` is reverse-DNS (e.g., `com.acme.bookmarks`). We validate the id format here as a defence-in-depth measure (the manifest reader in Task 3 also validates it).

- [ ] **Step 1: Write the failing tests**

```rust
// src-tauri/src/core/extensions/paths.rs

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn validates_extension_id() {
        assert!(is_valid_extension_id("com.acme.bookmarks"));
        assert!(is_valid_extension_id("a.b"));
        assert!(is_valid_extension_id("io.openacp.hello-world"));
        assert!(is_valid_extension_id("com.acme.app_v2"));

        // bad
        assert!(!is_valid_extension_id(""));
        assert!(!is_valid_extension_id("noDots"));
        assert!(!is_valid_extension_id("../escape"));
        assert!(!is_valid_extension_id("with spaces"));
        assert!(!is_valid_extension_id("trailing."));
        assert!(!is_valid_extension_id(".leading"));
        assert!(!is_valid_extension_id("a..b"));
        assert!(!is_valid_extension_id("a/b"));
        assert!(!is_valid_extension_id("a\\b"));
        assert!(!is_valid_extension_id("UPPER.case"));
    }

    #[test]
    fn extensions_dir_uses_known_root() {
        let root = PathBuf::from("/tmp/oacp-test");
        let ext_dir = extensions_dir_at(&root, "com.acme.foo").unwrap();
        assert_eq!(
            ext_dir,
            PathBuf::from("/tmp/oacp-test/extensions/com.acme.foo")
        );
    }

    #[test]
    fn extensions_dir_rejects_bad_id() {
        let root = PathBuf::from("/tmp/oacp-test");
        assert!(extensions_dir_at(&root, "../escape").is_err());
        assert!(extensions_dir_at(&root, "a/b").is_err());
        assert!(extensions_dir_at(&root, "").is_err());
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::paths`
Expected: FAIL — `is_valid_extension_id` and `extensions_dir_at` not found.

- [ ] **Step 3: Implement the validators and helpers**

Add at the top of `src-tauri/src/core/extensions/paths.rs`:

```rust
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PathError {
    #[error("invalid extension id: {0}")]
    InvalidId(String),
    #[error("path escapes extension root")]
    PathEscape,
    #[error("appdata directory unavailable")]
    AppDataUnavailable,
}

/// Returns true if `id` is a valid reverse-DNS extension id.
///
/// Format: lowercase ASCII letters, digits, dots, hyphens, underscores;
/// must contain at least one dot; no leading/trailing dots; no consecutive
/// dots; no path separators.
pub fn is_valid_extension_id(id: &str) -> bool {
    if id.is_empty() || id.starts_with('.') || id.ends_with('.') {
        return false;
    }
    if !id.contains('.') {
        return false;
    }
    if id.contains("..") {
        return false;
    }
    id.chars().all(|c| {
        c.is_ascii_lowercase()
            || c.is_ascii_digit()
            || c == '.'
            || c == '-'
            || c == '_'
    })
}

/// Returns `<root>/extensions/<extId>/`. `root` is supplied by the caller so
/// tests can use a tmpdir; production callers use `extensions_dir`.
pub fn extensions_dir_at(root: &Path, ext_id: &str) -> Result<PathBuf, PathError> {
    if !is_valid_extension_id(ext_id) {
        return Err(PathError::InvalidId(ext_id.to_string()));
    }
    Ok(root.join("extensions").join(ext_id))
}

/// Production resolver: anchors to the OS-specific app data directory.
/// Plan 1 does not call this from production code (the scheme handler
/// inlines the appdata root). Plans 6 and 7 (storage + install) consume it.
#[allow(dead_code)]
pub fn extensions_dir(ext_id: &str) -> Result<PathBuf, PathError> {
    let root = appdata_root()?;
    extensions_dir_at(&root, ext_id)
}

fn appdata_root() -> Result<PathBuf, PathError> {
    // OpenACP's existing convention: data_dir() / "OpenACP".
    // Mirrors how core::filesystem locates user data.
    let base = dirs::data_dir().ok_or(PathError::AppDataUnavailable)?;
    Ok(base.join("OpenACP"))
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::paths`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/paths.rs
git commit -m "feat(extensions): add extension id validator and path resolver"
```

---

## Task 3 — Path traversal-safe join

**Files:**
- Modify: `src-tauri/src/core/extensions/paths.rs`

The scheme handler receives a relative path from the URL (e.g., `dist/main.js`). We must join it with the extension root and prove the result stays inside the root. This is the single most important security check in the Rust layer.

- [ ] **Step 1: Write the failing tests**

Append to `src-tauri/src/core/extensions/paths.rs`:

```rust
#[cfg(test)]
mod join_tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup() -> (TempDir, PathBuf) {
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("extensions").join("com.acme.foo");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("a.txt"), b"hello").unwrap();
        fs::create_dir_all(root.join("dist")).unwrap();
        fs::write(root.join("dist").join("main.js"), b"// js").unwrap();
        (dir, root)
    }

    #[tokio::test]
    async fn joins_relative_path() {
        let (_g, root) = setup();
        let p = safe_join(&root, "a.txt").await.unwrap();
        assert_eq!(p, root.join("a.txt"));
    }

    #[tokio::test]
    async fn joins_nested_path() {
        let (_g, root) = setup();
        let p = safe_join(&root, "dist/main.js").await.unwrap();
        assert_eq!(p, root.join("dist").join("main.js"));
    }

    #[tokio::test]
    async fn rejects_dotdot_escape() {
        let (_g, root) = setup();
        let res = safe_join(&root, "../../../etc/passwd").await;
        assert!(matches!(res, Err(PathError::PathEscape)));
    }

    #[tokio::test]
    async fn rejects_absolute_path() {
        let (_g, root) = setup();
        let res = safe_join(&root, "/etc/passwd").await;
        assert!(matches!(res, Err(PathError::PathEscape)));
    }

    #[tokio::test]
    async fn rejects_symlink_escape() {
        let (g, root) = setup();
        let outside = g.path().join("outside.txt");
        fs::write(&outside, b"secret").unwrap();
        // create a symlink inside the root pointing outside
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, root.join("link")).unwrap();
        let res = safe_join(&root, "link").await;
        assert!(matches!(res, Err(PathError::PathEscape)));
    }
}
```

- [ ] **Step 2: Add `tempfile` to dev-dependencies**

Modify `src-tauri/Cargo.toml`. Add a `[dev-dependencies]` section (or extend if it exists) above `[target.'cfg(unix)'.dependencies]`:

```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::paths::join_tests`
Expected: FAIL — `safe_join` not found.

- [ ] **Step 4: Implement `safe_join`**

Append to `src-tauri/src/core/extensions/paths.rs`:

```rust
/// Joins `relative` onto `root` and proves the result stays inside `root`,
/// resolving symlinks. Rejects absolute paths, `..` escapes, and symlinks
/// pointing outside `root`.
///
/// Both `root` and the joined path are canonicalized; mismatches yield
/// `PathError::PathEscape`. The function is async because it reads the
/// filesystem to resolve symlinks; callers in async contexts (the URI
/// scheme handler) should `await` it.
pub async fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, PathError> {
    // Reject absolute paths up front; on Windows that includes drive-letter
    // and UNC forms.
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return Err(PathError::PathEscape);
    }
    // Reject any component that is `..`. Paranoid: even if canonicalize
    // would catch this, refusing it here makes the intent explicit.
    for comp in rel.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err(PathError::PathEscape);
        }
    }

    let candidate = root.join(rel);
    // Canonicalize both sides. canonicalize follows symlinks; if the resolved
    // candidate is not a descendant of the resolved root, reject.
    let root_real = tokio::fs::canonicalize(root)
        .await
        .map_err(|_| PathError::PathEscape)?;
    let cand_real = tokio::fs::canonicalize(&candidate)
        .await
        .map_err(|_| PathError::PathEscape)?;

    if cand_real.starts_with(&root_real) {
        Ok(cand_real)
    } else {
        Err(PathError::PathEscape)
    }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::paths`
Expected: PASS — original 3 + 5 new = 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/core/extensions/paths.rs src-tauri/Cargo.toml
git commit -m "feat(extensions): add traversal-safe path join helper"
```

---

## Task 4 — Minimal manifest reader

**Files:**
- Modify: `src-tauri/src/core/extensions/manifest.rs`

Reads only the fields Plan 1 needs to serve files: `id` (must match the URL extId), `manifestVersion`, and `main`/`uiEntries` (informational; not enforced here). Full schema validation lands in sub-project #2.

- [ ] **Step 1: Write the failing tests**

```rust
// src-tauri/src/core/extensions/manifest.rs

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_manifest(dir: &TempDir, body: &str) -> std::path::PathBuf {
        let path = dir.path().join("extension.json");
        std::fs::write(&path, body).unwrap();
        path
    }

    #[tokio::test]
    async fn reads_minimal_manifest() {
        let dir = TempDir::new().unwrap();
        write_manifest(
            &dir,
            r#"{
              "manifestVersion": 1,
              "id": "com.acme.foo",
              "version": "1.0.0",
              "capabilities": ["commands"],
              "activationEvents": ["onStartup"]
            }"#,
        );
        let m = read_minimal_manifest(dir.path()).await.unwrap();
        assert_eq!(m.manifest_version, 1);
        assert_eq!(m.id, "com.acme.foo");
        assert_eq!(m.version, "1.0.0");
        assert_eq!(m.main.as_deref(), None);
    }

    #[tokio::test]
    async fn defaults_main_when_absent() {
        let dir = TempDir::new().unwrap();
        write_manifest(
            &dir,
            r#"{
              "manifestVersion": 1,
              "id": "com.acme.foo",
              "version": "1.0.0",
              "capabilities": [],
              "activationEvents": []
            }"#,
        );
        let m = read_minimal_manifest(dir.path()).await.unwrap();
        assert_eq!(m.resolved_main(), "dist/main.js");
    }

    #[tokio::test]
    async fn honours_explicit_main() {
        let dir = TempDir::new().unwrap();
        write_manifest(
            &dir,
            r#"{
              "manifestVersion": 1,
              "id": "com.acme.foo",
              "version": "1.0.0",
              "main": "dist/entry.js",
              "capabilities": [],
              "activationEvents": []
            }"#,
        );
        let m = read_minimal_manifest(dir.path()).await.unwrap();
        assert_eq!(m.resolved_main(), "dist/entry.js");
    }

    #[tokio::test]
    async fn rejects_missing_file() {
        let dir = TempDir::new().unwrap();
        let res = read_minimal_manifest(dir.path()).await;
        assert!(matches!(res, Err(ManifestError::Missing)));
    }

    #[tokio::test]
    async fn rejects_invalid_json() {
        let dir = TempDir::new().unwrap();
        write_manifest(&dir, "{ not json");
        let res = read_minimal_manifest(dir.path()).await;
        assert!(matches!(res, Err(ManifestError::InvalidJson(_))));
    }

    #[tokio::test]
    async fn rejects_unsupported_version() {
        let dir = TempDir::new().unwrap();
        write_manifest(
            &dir,
            r#"{
              "manifestVersion": 999,
              "id": "com.acme.foo",
              "version": "1.0.0",
              "capabilities": [],
              "activationEvents": []
            }"#,
        );
        let res = read_minimal_manifest(dir.path()).await;
        assert!(matches!(res, Err(ManifestError::UnsupportedVersion(999))));
    }

    #[tokio::test]
    async fn rejects_invalid_id() {
        let dir = TempDir::new().unwrap();
        write_manifest(
            &dir,
            r#"{
              "manifestVersion": 1,
              "id": "../escape",
              "version": "1.0.0",
              "capabilities": [],
              "activationEvents": []
            }"#,
        );
        let res = read_minimal_manifest(dir.path()).await;
        assert!(matches!(res, Err(ManifestError::InvalidId(_))));
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::manifest`
Expected: FAIL — `read_minimal_manifest` and `ManifestError` not found.

- [ ] **Step 3: Implement the reader**

Replace the contents of `src-tauri/src/core/extensions/manifest.rs`:

```rust
use crate::core::extensions::paths::is_valid_extension_id;
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

const SUPPORTED_MANIFEST_VERSION: u32 = 1;
const DEFAULT_MAIN: &str = "dist/main.js";

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("extension.json not found")]
    Missing,
    #[error("extension.json is not valid JSON: {0}")]
    InvalidJson(String),
    #[error("manifestVersion {0} is not supported (expected 1)")]
    UnsupportedVersion(u32),
    #[error("invalid extension id: {0}")]
    InvalidId(String),
    #[error("io error: {0}")]
    Io(String),
}

#[derive(Debug, Clone, Deserialize)]
pub struct MinimalManifest {
    #[serde(rename = "manifestVersion")]
    pub manifest_version: u32,
    pub id: String,
    pub version: String,
    #[serde(default)]
    pub main: Option<String>,
    #[serde(rename = "uiEntries", default)]
    pub ui_entries: HashMap<String, String>,
}

impl MinimalManifest {
    pub fn resolved_main(&self) -> &str {
        self.main.as_deref().unwrap_or(DEFAULT_MAIN)
    }
}

pub async fn read_minimal_manifest(extension_root: &Path) -> Result<MinimalManifest, ManifestError> {
    let path = extension_root.join("extension.json");
    let bytes = match tokio::fs::read(&path).await {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Err(ManifestError::Missing),
        Err(e) => return Err(ManifestError::Io(e.to_string())),
    };
    let manifest: MinimalManifest =
        serde_json::from_slice(&bytes).map_err(|e| ManifestError::InvalidJson(e.to_string()))?;

    if manifest.manifest_version != SUPPORTED_MANIFEST_VERSION {
        return Err(ManifestError::UnsupportedVersion(manifest.manifest_version));
    }
    if !is_valid_extension_id(&manifest.id) {
        return Err(ManifestError::InvalidId(manifest.id.clone()));
    }
    Ok(manifest)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::manifest`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/manifest.rs
git commit -m "feat(extensions): add minimal manifest reader for plan 1"
```

---

## Task 5 — MIME type helper

**Files:**
- Modify: `src-tauri/src/core/extensions/scheme.rs`

Hardcoded mapping for the file types extensions actually ship in v1. Anything else gets `application/octet-stream`.

- [ ] **Step 1: Write the failing tests**

```rust
// src-tauri/src/core/extensions/scheme.rs

#[cfg(test)]
mod mime_tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn maps_known_extensions() {
        assert_eq!(mime_for(Path::new("a.html")), "text/html; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.js")), "text/javascript; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.mjs")), "text/javascript; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.css")), "text/css; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.json")), "application/json; charset=utf-8");
        assert_eq!(mime_for(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(mime_for(Path::new("a.png")), "image/png");
        assert_eq!(mime_for(Path::new("a.map")), "application/json; charset=utf-8");
    }

    #[test]
    fn falls_back_to_octet_stream() {
        assert_eq!(mime_for(Path::new("a.unknown")), "application/octet-stream");
        assert_eq!(mime_for(Path::new("noext")), "application/octet-stream");
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme::mime_tests`
Expected: FAIL — `mime_for` not found.

- [ ] **Step 3: Implement `mime_for`**

Replace the contents of `src-tauri/src/core/extensions/scheme.rs`:

```rust
use std::path::Path;

pub(crate) fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") | Some("map") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme::mime_tests`
Expected: PASS — both tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/scheme.rs
git commit -m "feat(extensions): add MIME helper for scheme handler"
```

---

## Task 6 — Scheme handler core (request → response)

**Files:**
- Modify: `src-tauri/src/core/extensions/scheme.rs`

Implements the function the Tauri builder will register. URL shape: `openacp-ext://<extId>/<path>`. The host portion of the URL maps to `<extId>`. The path portion maps to a file inside the extension root.

For path `""` or `/` we serve the resolved `main` (from the manifest). Otherwise we serve the path as-is.

- [ ] **Step 1: Write the failing tests**

Append to `src-tauri/src/core/extensions/scheme.rs`:

```rust
#[cfg(test)]
mod handler_tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_ext(dir: &TempDir, id: &str, files: &[(&str, &[u8])]) -> std::path::PathBuf {
        let root = dir.path().join("extensions").join(id);
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("extension.json"),
            format!(
                r#"{{"manifestVersion":1,"id":"{id}","version":"1.0.0","capabilities":[],"activationEvents":[]}}"#
            ),
        )
        .unwrap();
        for (rel, body) in files {
            let p = root.join(rel);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(p, body).unwrap();
        }
        root
    }

    #[tokio::test]
    async fn serves_static_file() {
        let dir = TempDir::new().unwrap();
        make_ext(
            &dir,
            "com.acme.foo",
            &[("dist/main.js", b"console.log('hi')")],
        );
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/dist/main.js",
        )
        .await;
        assert_eq!(resp.status, 200);
        assert_eq!(
            resp.headers.get("content-type").unwrap(),
            "text/javascript; charset=utf-8"
        );
        assert_eq!(resp.body, b"console.log('hi')");
    }

    #[tokio::test]
    async fn root_path_serves_main() {
        let dir = TempDir::new().unwrap();
        make_ext(
            &dir,
            "com.acme.foo",
            &[("dist/main.js", b"// entry")],
        );
        let resp =
            handle_request_at(dir.path(), "openacp-ext://com.acme.foo/").await;
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, b"// entry");
    }

    #[tokio::test]
    async fn missing_file_404() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/dist/missing.js",
        )
        .await;
        assert_eq!(resp.status, 404);
    }

    #[tokio::test]
    async fn missing_extension_404() {
        let dir = TempDir::new().unwrap();
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.unknown/dist/main.js",
        )
        .await;
        assert_eq!(resp.status, 404);
    }

    #[tokio::test]
    async fn traversal_attempt_403() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/../../etc/passwd",
        )
        .await;
        assert_eq!(resp.status, 403);
    }

    #[tokio::test]
    async fn invalid_ext_id_404() {
        let dir = TempDir::new().unwrap();
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://NOT_VALID/dist/main.js",
        )
        .await;
        assert_eq!(resp.status, 404);
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme::handler_tests`
Expected: FAIL — `handle_request_at` and `Response` not found.

- [ ] **Step 3: Implement the handler**

Append to `src-tauri/src/core/extensions/scheme.rs`:

```rust
use crate::core::extensions::manifest::read_minimal_manifest;
use crate::core::extensions::paths::{extensions_dir_at, safe_join};
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

impl Response {
    fn status_only(status: u16) -> Self {
        Self {
            status,
            headers: HashMap::new(),
            body: Vec::new(),
        }
    }
}

/// Test-friendly entry point. The production handler in `register_scheme`
/// wraps this with the production `appdata_root`.
pub async fn handle_request_at(root: &Path, url: &str) -> Response {
    let parsed = match parse_url(url) {
        Some(p) => p,
        None => return Response::status_only(400),
    };

    let ext_root = match extensions_dir_at(root, &parsed.ext_id) {
        Ok(p) => p,
        Err(_) => return Response::status_only(404),
    };

    let manifest = match read_minimal_manifest(&ext_root).await {
        Ok(m) => m,
        Err(_) => return Response::status_only(404),
    };

    let relative = if parsed.path.is_empty() || parsed.path == "/" {
        manifest.resolved_main().to_string()
    } else {
        parsed.path.trim_start_matches('/').to_string()
    };

    let file_path = match safe_join(&ext_root, &relative).await {
        Ok(p) => p,
        Err(crate::core::extensions::paths::PathError::PathEscape) => {
            return Response::status_only(403)
        }
        Err(_) => return Response::status_only(404),
    };

    let body = match tokio::fs::read(&file_path).await {
        Ok(b) => b,
        Err(_) => return Response::status_only(404),
    };

    let mut headers = HashMap::new();
    headers.insert(
        "content-type".to_string(),
        mime_for(&file_path).to_string(),
    );

    Response {
        status: 200,
        headers,
        body,
    }
}

struct ParsedUrl {
    ext_id: String,
    path: String,
}

fn parse_url(url: &str) -> Option<ParsedUrl> {
    // Expected: openacp-ext://<extId>/<path...>
    let after_scheme = url.strip_prefix("openacp-ext://")?;
    let (ext_id, rest) = match after_scheme.split_once('/') {
        Some((host, rest)) => (host.to_string(), rest.to_string()),
        None => (after_scheme.to_string(), String::new()),
    };
    Some(ParsedUrl {
        ext_id,
        path: rest,
    })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme`
Expected: PASS — mime tests + 6 handler tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/scheme.rs
git commit -m "feat(extensions): implement scheme handler core with traversal guard"
```

---

## Task 7 — CSP headers per response

**Files:**
- Modify: `src-tauri/src/core/extensions/scheme.rs`

Every response from the scheme handler carries a strict CSP. Connect-src is left as `'self'` for now; once `http.fetch` lands in plan 6, it will add the manifest's hostname allowlist. Frame-ancestors restricts who may embed an extension page, hardening against UI redress from the host's own webviews.

- [ ] **Step 1: Write the failing tests**

Append to `src-tauri/src/core/extensions/scheme.rs`:

```rust
#[cfg(test)]
mod csp_tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn make_ext(dir: &TempDir, id: &str, files: &[(&str, &[u8])]) -> std::path::PathBuf {
        let root = dir.path().join("extensions").join(id);
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("extension.json"),
            format!(
                r#"{{"manifestVersion":1,"id":"{id}","version":"1.0.0","capabilities":[],"activationEvents":[]}}"#
            ),
        )
        .unwrap();
        for (rel, body) in files {
            let p = root.join(rel);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(p, body).unwrap();
        }
        root
    }

    #[tokio::test]
    async fn html_response_has_csp() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/ui/p.html", b"<html></html>")]);
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/dist/ui/p.html",
        )
        .await;
        let csp = resp.headers.get("content-security-policy").unwrap();
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("script-src 'self'"));
        assert!(csp.contains("style-src 'self' 'unsafe-inline'"));
        assert!(csp.contains("connect-src 'self'"));
        assert!(csp.contains("frame-ancestors 'self'"));
    }

    #[tokio::test]
    async fn js_response_has_csp() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/dist/main.js",
        )
        .await;
        assert!(resp.headers.contains_key("content-security-policy"));
    }

    #[tokio::test]
    async fn cross_origin_isolated_headers() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp = handle_request_at(
            dir.path(),
            "openacp-ext://com.acme.foo/dist/main.js",
        )
        .await;
        // Defence-in-depth: prevents the iframe from being embedded by a
        // third-party origin if the extension is ever served outside the host.
        assert_eq!(
            resp.headers.get("x-content-type-options").unwrap(),
            "nosniff"
        );
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme::csp_tests`
Expected: FAIL — `content-security-policy` and `x-content-type-options` headers not set.

- [ ] **Step 3: Add a CSP helper and apply it**

Append to `src-tauri/src/core/extensions/scheme.rs`:

```rust
fn apply_security_headers(headers: &mut HashMap<String, String>) {
    let csp = "default-src 'self'; \
               script-src 'self'; \
               style-src 'self' 'unsafe-inline'; \
               img-src 'self' data: blob:; \
               font-src 'self' data:; \
               connect-src 'self'; \
               frame-ancestors 'self'; \
               base-uri 'self'; \
               form-action 'none'";
    headers.insert("content-security-policy".to_string(), csp.to_string());
    headers.insert("x-content-type-options".to_string(), "nosniff".to_string());
    headers.insert(
        "referrer-policy".to_string(),
        "no-referrer".to_string(),
    );
}
```

Now modify `handle_request_at` to call it just before constructing the success `Response`. Locate the lines that build the success response (the section that sets `content-type` and returns):

```rust
    let mut headers = HashMap::new();
    headers.insert(
        "content-type".to_string(),
        mime_for(&file_path).to_string(),
    );
    apply_security_headers(&mut headers);

    Response {
        status: 200,
        headers,
        body,
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions::scheme`
Expected: PASS — all scheme tests, including the 3 CSP tests.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/scheme.rs
git commit -m "feat(extensions): apply CSP and security headers to every response"
```

---

## Task 8 — Register the scheme on the Tauri builder

**Files:**
- Modify: `src-tauri/src/core/extensions/scheme.rs`
- Modify: `src-tauri/src/lib.rs`

The Tauri 2 async URI scheme protocol API takes a closure receiving `(AppHandle, http::Request<Vec<u8>>) -> Future<Output = http::Response<Cow<[u8]>>>`. We adapt our `handle_request_at` to that interface.

- [ ] **Step 1: Add the production wrapper**

Append to `src-tauri/src/core/extensions/scheme.rs`:

```rust
/// Production handler. Resolves the extensions root from the OS appdata
/// directory and delegates to `handle_request_at`.
pub async fn handle_request(url: &str) -> Response {
    let root = match dirs::data_dir() {
        Some(d) => d.join("OpenACP"),
        None => return Response::status_only(500),
    };
    handle_request_at(&root, url).await
}
```

- [ ] **Step 2: Wire up the scheme on the Tauri builder**

Modify `src-tauri/src/lib.rs`. Locate the `tauri::Builder::default()` chain (around the line that begins `tauri::Builder::default()` and ends with `.run(...)`). Insert a call to `register_asynchronous_uri_scheme_protocol` immediately after `.plugin(...)` calls but before `.setup(...)` (or before `.invoke_handler(...)` if `.setup` is absent). The exact placement: anywhere in the chain before `.run`, but adjacent to other `register_*` calls if any exist.

Add to the chain:

```rust
        .register_asynchronous_uri_scheme_protocol("openacp-ext", |_app, request, responder| {
            tauri::async_runtime::spawn(async move {
                let url = request.uri().to_string();
                let resp = crate::core::extensions::scheme::handle_request(&url).await;

                let mut builder = tauri::http::Response::builder().status(resp.status);
                for (k, v) in &resp.headers {
                    builder = builder.header(k, v);
                }
                let http_resp = builder
                    .body(resp.body)
                    .unwrap_or_else(|_| {
                        tauri::http::Response::builder()
                            .status(500)
                            .body(Vec::new())
                            .unwrap()
                    });
                responder.respond(http_resp);
            });
        })
```

- [ ] **Step 3: Verify cargo check**

Run: `cd src-tauri && cargo check`
Expected: clean compile. If you see "method `register_asynchronous_uri_scheme_protocol` not found", verify your Tauri version is `2` (it is — see `Cargo.toml`) and that `Manager` is imported (it already is in lib.rs).

- [ ] **Step 4: Run all extension tests**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib extensions`
Expected: PASS — all tests across `paths`, `manifest`, `scheme::mime_tests`, `scheme::handler_tests`, `scheme::csp_tests`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/core/extensions/scheme.rs src-tauri/src/lib.rs
git commit -m "feat(extensions): register openacp-ext URI scheme on tauri builder"
```

---

## Task 9 — Manual smoke test

**Files:**
- No code changes.

Verify the scheme works end-to-end in dev mode by hand-placing a tiny extension and loading it from devtools. This is the deliverable proof: nothing in the host UI uses the scheme yet, so we exercise it via a console one-liner.

- [ ] **Step 1: Hand-create a test extension**

On macOS, create `~/Library/Application Support/OpenACP/extensions/com.smoke.test/` and inside it place:

`extension.json`:
```json
{
  "manifestVersion": 1,
  "id": "com.smoke.test",
  "version": "0.0.1",
  "capabilities": [],
  "activationEvents": []
}
```

`dist/main.js`:
```js
console.log("smoke ok");
```

`dist/ui/hello.html`:
```html
<!doctype html>
<meta charset="utf-8" />
<title>smoke</title>
<body>hello from extension iframe</body>
```

Same paths apply on Linux (`~/.local/share/OpenACP/...`) and Windows (`%APPDATA%\OpenACP\...`).

- [ ] **Step 2: Run the app in dev**

Run: `pnpm tauri dev` (from the repo root)
Expected: app launches normally.

- [ ] **Step 3: Open devtools and run a fetch**

In the main window devtools console:

```js
const r = await fetch("openacp-ext://com.smoke.test/dist/main.js");
console.log("[smoke]", r.status, await r.text());
```

Expected: `[smoke] 200 console.log("smoke ok");`

- [ ] **Step 4: Confirm CSP header**

```js
const r = await fetch("openacp-ext://com.smoke.test/dist/ui/hello.html");
console.log("[smoke]", r.headers.get("content-security-policy"));
```

Expected: a CSP string that contains `default-src 'self'; script-src 'self'; ...`.

- [ ] **Step 5: Confirm traversal is blocked**

```js
const r = await fetch("openacp-ext://com.smoke.test/../../etc/passwd");
console.log("[smoke]", r.status);
```

Expected: `[smoke] 403`.

- [ ] **Step 6: Confirm unknown extension yields 404**

```js
const r = await fetch("openacp-ext://com.smoke.does-not-exist/dist/main.js");
console.log("[smoke]", r.status);
```

Expected: `[smoke] 404`.

- [ ] **Step 7: Stop the dev server**

Hit Ctrl-C in the `pnpm tauri dev` terminal.

- [ ] **Step 8: Document the smoke result**

Optional: jot a one-line note in your terminal/notes confirming the four checks passed. No file changes; nothing to commit.

---

## Plan 1 done — what shipped

- `openacp-ext://<extId>/<path>` is a registered Tauri custom URI scheme.
- Files under `$APPDATA/OpenACP/extensions/<extId>/` are reachable from the webview.
- Path traversal, absolute paths, and symlink escapes return `403`.
- Missing extensions or files return `404`.
- Every successful response carries a strict CSP, `x-content-type-options: nosniff`, and `referrer-policy: no-referrer`.
- `read_minimal_manifest` validates `manifestVersion`, `id`, and exposes `resolved_main()` for the root-path fallback.
- All behaviour is covered by inline `cargo test` units.

## What plan 2 picks up

Plan 2 stands up `packages/extension-api/`, the ext-side runtime bootstrap, and the host's iframe loader so an extension can `await api.activated()` from inside the iframe. Plan 2 depends on this scheme working — it loads the extension's `main.js` via `openacp-ext://<extId>/dist/main.js` and the runtime stub via `openacp-ext://<extId>/__runtime__/extension-runtime.js` (a virtual path the scheme handler will start synthesising in plan 2).
