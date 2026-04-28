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

/// Joins `relative` onto `root` and proves the result stays inside `root`,
/// resolving symlinks. Rejects absolute paths, `..` escapes, and symlinks
/// pointing outside `root`.
///
/// Both `root` and the joined path are canonicalized; mismatches yield
/// `PathError::PathEscape`. The function is async because it reads the
/// filesystem to resolve symlinks; callers in async contexts (the URI
/// scheme handler) should `await` it.
pub async fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, PathError> {
    let rel = Path::new(relative);
    if rel.is_absolute() {
        return Err(PathError::PathEscape);
    }
    for comp in rel.components() {
        if matches!(comp, std::path::Component::ParentDir) {
            return Err(PathError::PathEscape);
        }
    }

    let candidate = root.join(rel);
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
        assert_eq!(p, tokio::fs::canonicalize(root.join("a.txt")).await.unwrap());
    }

    #[tokio::test]
    async fn joins_nested_path() {
        let (_g, root) = setup();
        let p = safe_join(&root, "dist/main.js").await.unwrap();
        assert_eq!(
            p,
            tokio::fs::canonicalize(root.join("dist").join("main.js"))
                .await
                .unwrap()
        );
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
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside, root.join("link")).unwrap();
        let res = safe_join(&root, "link").await;
        assert!(matches!(res, Err(PathError::PathEscape)));
    }
}
