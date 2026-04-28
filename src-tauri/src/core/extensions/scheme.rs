use crate::core::extensions::manifest::read_minimal_manifest;
use crate::core::extensions::paths::{extensions_dir_at, safe_join, PathError};
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
    headers.insert("referrer-policy".to_string(), "no-referrer".to_string());
}

/// Test-friendly entry point. The production handler in `handle_request`
/// wraps this with the production appdata root.
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
        Err(PathError::PathEscape) => return Response::status_only(403),
        Err(PathError::NotFound) => return Response::status_only(404),
        Err(_) => return Response::status_only(404),
    };

    let body = match tokio::fs::read(&file_path).await {
        Ok(b) => b,
        Err(_) => return Response::status_only(404),
    };

    let mut headers = HashMap::new();
    headers.insert("content-type".to_string(), mime_for(&file_path).to_string());
    apply_security_headers(&mut headers);

    Response {
        status: 200,
        headers,
        body,
    }
}

/// Production handler. Resolves the extensions root from the OS appdata
/// directory and delegates to `handle_request_at`.
pub async fn handle_request(url: &str) -> Response {
    let root = match dirs::data_dir() {
        Some(d) => d.join("OpenACP"),
        None => return Response::status_only(500),
    };
    handle_request_at(&root, url).await
}

struct ParsedUrl {
    ext_id: String,
    path: String,
}

fn parse_url(url: &str) -> Option<ParsedUrl> {
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
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"console.log('hi')")]);
        let resp =
            handle_request_at(dir.path(), "openacp-ext://com.acme.foo/dist/main.js").await;
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
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp = handle_request_at(dir.path(), "openacp-ext://com.acme.foo/").await;
        assert_eq!(resp.status, 200);
        assert_eq!(resp.body, b"// entry");
    }

    #[tokio::test]
    async fn missing_file_404() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp =
            handle_request_at(dir.path(), "openacp-ext://com.acme.foo/dist/missing.js").await;
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
        let resp = handle_request_at(dir.path(), "openacp-ext://NOT_VALID/dist/main.js").await;
        assert_eq!(resp.status, 404);
    }
}

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
        let resp =
            handle_request_at(dir.path(), "openacp-ext://com.acme.foo/dist/main.js").await;
        assert!(resp.headers.contains_key("content-security-policy"));
    }

    #[tokio::test]
    async fn cross_origin_isolated_headers() {
        let dir = TempDir::new().unwrap();
        make_ext(&dir, "com.acme.foo", &[("dist/main.js", b"// entry")]);
        let resp =
            handle_request_at(dir.path(), "openacp-ext://com.acme.foo/dist/main.js").await;
        assert_eq!(
            resp.headers.get("x-content-type-options").unwrap(),
            "nosniff"
        );
    }
}
