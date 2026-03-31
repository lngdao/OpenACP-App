mod sidecar;

use sidecar::SidecarManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

struct AppState {
    sidecar: Arc<Mutex<SidecarManager>>,
}

#[tauri::command]
async fn get_server_info(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mgr = state.sidecar.lock().await;
    mgr.server_info()
        .ok_or_else(|| "Server not ready".to_string())
}

#[tauri::command]
async fn start_server(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.start().await.map_err(|e| e.to_string())?;

    // Wait for health check
    let info = mgr
        .server_info()
        .ok_or_else(|| "Server started but info not available".to_string())?;
    Ok(info)
}

#[tauri::command]
async fn stop_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.stop().await;
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub struct ServerInfo {
    pub url: String,
    pub token: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openacp_lib=info".parse().unwrap()),
        )
        .init();

    let sidecar = Arc::new(Mutex::new(SidecarManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            start_server,
            stop_server,
        ])
        .setup(move |app| {
            app.manage(AppState {
                sidecar: sidecar.clone(),
            });

            // Auto-start: try to detect already-running OpenACP server
            let sidecar_clone = sidecar.clone();
            tauri::async_runtime::spawn(async move {
                let mut mgr = sidecar_clone.lock().await;
                if mgr.detect_running().await {
                    tracing::info!("Detected running OpenACP server");
                } else {
                    tracing::info!("No running server detected — will connect on user action");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                tracing::info!("App exiting");
                // Note: we don't kill the sidecar on exit because OpenACP
                // server may be used by other clients (Telegram, etc.)
            }
        });
}
