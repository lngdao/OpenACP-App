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
    #[allow(dead_code)]
    pub version: String,
    #[serde(default)]
    pub main: Option<String>,
    #[serde(rename = "uiEntries", default)]
    #[allow(dead_code)]
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
