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

#[allow(dead_code)]
fn appdata_root() -> Result<PathBuf, PathError> {
    let base = dirs::data_dir().ok_or(PathError::AppDataUnavailable)?;
    Ok(base.join("OpenACP"))
}

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
