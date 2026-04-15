//! Resolves the user's shell environment exactly once per app lifetime and
//! caches it in a `OnceLock<ShellEnv>`. Every spawn site in the app reads
//! from this cache instead of spawning a shell itself.
//!
//! See `docs/superpowers/specs/2026-04-15-unified-shell-env-design.md`.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// Env vars that must NEVER be inherited by the openacp CLI child process,
/// regardless of what's in the user's shell. Each is an injection vector or
/// footgun for a Node.js CLI specifically.
const DENYLIST: &[&str] = &[
    // Node injection — openacp is a Node CLI
    "NODE_OPTIONS",        // can --require arbitrary scripts
    "NODE_PATH",           // can hijack module resolution
    // Shell injection — bash/sh -c sources these before running commands
    "BASH_ENV",
    "ENV",
    // npm prefix — if set weirdly, `openacp agents install` writes to the
    // wrong place. Explicit is safer.
    "npm_config_prefix",
    "NPM_CONFIG_PREFIX",
];

/// Platform-specific well-known directories where `node` may live. Merged
/// into the cached PATH so the `#!/usr/bin/env node` shebang always resolves.
#[cfg(not(windows))]
const WELL_KNOWN_NODE_DIRS: &[&str] = &[
    "/usr/local/bin",
    "/opt/homebrew/bin",
];

/// How long to wait for the shell to produce env output before giving up
/// and falling back to `std::env`.
const TIMEOUT: Duration = Duration::from_secs(5);

/// A resolved snapshot of the user's shell environment.
#[derive(Debug, Clone)]
pub struct ShellEnv {
    /// Full env as captured from the shell, with DENYLIST entries removed.
    pub vars: HashMap<String, String>,
    /// Pre-deduped PATH with well-known node dirs merged in. This is what
    /// callers set on spawned `Command::env("PATH", ...)`.
    pub path: String,
    /// Which shell resolved the env, for diagnostics. `None` on Windows or
    /// on fallback.
    pub resolved_via: Option<String>,
}

static SNAPSHOT: OnceLock<ShellEnv> = OnceLock::new();

// ─── Public API ─────────────────────────────────────────────────────────

/// Resolves the shell env and caches it. Idempotent — subsequent calls are
/// no-ops. Intended to be called from a dedicated OS thread at startup so
/// a slow `.zshrc` never blocks the async runtime.
pub fn prewarm() {
    let _ = SNAPSHOT.get_or_init(resolve_blocking);
}

/// Returns the cached snapshot. If prewarm hasn't finished, performs the
/// resolve synchronously (bounded by TIMEOUT). Never blocks indefinitely,
/// never errors — always returns a usable `ShellEnv` (falling back to
/// `std::env` on any failure).
pub fn snapshot() -> &'static ShellEnv {
    SNAPSHOT.get_or_init(resolve_blocking)
}

/// Convenience: just the cached PATH string.
pub fn path() -> &'static str {
    &snapshot().path
}

/// Returns a clean env `HashMap` suitable for spawning `openacp` and its
/// children. Starts from the DENYLIST-stripped snapshot vars, overrides PATH
/// with an optional prefix prepended, and returns the result.
pub fn clean_env(extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    clean_env_from(snapshot(), extra_path_prefix)
}

/// Dedupe PATH entries while preserving order of first occurrence.
pub fn dedupe_path(path: &str, sep: &str) -> String {
    let _ = (path, sep);
    todo!("implemented in later task")
}

// ─── Internals (implemented in later tasks) ─────────────────────────────

fn parse_env_nul(_bytes: &[u8]) -> Option<HashMap<String, String>> {
    todo!("implemented in later task")
}

fn extract_marked_env(_stdout: &[u8], _marker: &str) -> Option<HashMap<String, String>> {
    todo!("implemented in later task")
}

fn clean_env_from(_env: &ShellEnv, _extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    todo!("implemented in later task")
}

fn resolve_blocking() -> ShellEnv {
    todo!("implemented in later task")
}

impl ShellEnv {
    fn from_vars(_vars: HashMap<String, String>, _resolved_via: Option<String>) -> Self {
        todo!("implemented in later task")
    }

    fn from_process_env() -> Self {
        todo!("implemented in later task")
    }

    fn build_path(_shell_path: &str) -> String {
        todo!("implemented in later task")
    }
}
