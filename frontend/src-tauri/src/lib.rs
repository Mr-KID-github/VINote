use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, Size, State, Url,
    WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const RECORDER_WINDOW_LABEL: &str = "recorder-window";
const MAIN_WINDOW_LABEL: &str = "main";
const NAVIGATE_EVENT: &str = "vinote-navigate";
const RECORDER_WIDTH: f64 = 360.0;
const RECORDER_EXPANDED_HEIGHT: f64 = 220.0;
const RECORDER_MINIMIZED_WIDTH: f64 = 320.0;
const RECORDER_MINIMIZED_HEIGHT: f64 = 64.0;
const EDGE_PADDING: f64 = 24.0;

#[derive(Default)]
struct RecorderRuntimeState {
    active: AtomicBool,
}

impl RecorderRuntimeState {
    fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::SeqCst);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(RecorderRuntimeState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            request_microphone_access,
            open_recorder_window,
            set_recorder_active,
            set_recorder_window_layout,
            show_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building VINote");

    app.run(handle_run_event);
}

fn recorder_window_url() -> &'static str {
    "index.html?recorderWindow=1&autostart=1"
}

fn recorder_window_reopen_url(mut current_url: Url) -> Url {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    current_url.set_path("/");
    current_url.set_query(Some(&format!(
        "recorderWindow=1&autostart=1&reopen={nonce}"
    )));
    current_url.set_fragment(None);
    current_url
}

fn recorder_window_position(app: &AppHandle) -> Option<LogicalPosition<f64>> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let position = monitor.position();
    let size = monitor.size();
    let scale = monitor.scale_factor();
    let left = position.x as f64 / scale;
    let top = position.y as f64 / scale;
    let width = size.width as f64 / scale;
    Some(LogicalPosition::new(
        (left + width - RECORDER_WIDTH - EDGE_PADDING).max(left),
        top + EDGE_PADDING,
    ))
}

#[tauri::command]
fn open_recorder_window(app: AppHandle) -> Result<String, String> {
    if let Some(window) = app.get_webview_window(RECORDER_WINDOW_LABEL) {
        if !app.state::<RecorderRuntimeState>().is_active() {
            if let Ok(url) = window.url() {
                let _ = window.navigate(recorder_window_reopen_url(url));
            }
        }
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.set_always_on_top(true);
        return Ok("existing".into());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        RECORDER_WINDOW_LABEL,
        WebviewUrl::App(recorder_window_url().into()),
    )
    .title("VINote Meeting Recorder")
    .inner_size(RECORDER_WIDTH, RECORDER_EXPANDED_HEIGHT)
    .min_inner_size(RECORDER_MINIMIZED_WIDTH, RECORDER_MINIMIZED_HEIGHT)
    .max_inner_size(RECORDER_WIDTH, RECORDER_EXPANDED_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .visible(true);

    if let Some(position) = recorder_window_position(&app) {
        builder = builder.position(position.x, position.y);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok("created".into())
}

fn recorder_window_size(layout: &str) -> Result<(f64, f64), String> {
    match layout {
        "expanded" => Ok((RECORDER_WIDTH, RECORDER_EXPANDED_HEIGHT)),
        "minimized" => Ok((RECORDER_MINIMIZED_WIDTH, RECORDER_MINIMIZED_HEIGHT)),
        _ => Err("invalid_recorder_window_layout".into()),
    }
}

#[tauri::command]
fn set_recorder_window_layout(app: AppHandle, layout: String) -> Result<(), String> {
    let window = app
        .get_webview_window(RECORDER_WINDOW_LABEL)
        .ok_or_else(|| "recorder_window_not_found".to_string())?;
    let (width, height) = recorder_window_size(&layout)?;
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_recorder_active(active: bool, state: State<'_, RecorderRuntimeState>) {
    state.set_active(active);
}

#[tauri::command]
fn show_main_window(app: AppHandle, route: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main_window_not_found".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    if let Some(route) = route {
        app.emit_to(MAIN_WINDOW_LABEL, NAVIGATE_EVENT, route)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn focus_recorder_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(RECORDER_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        RunEvent::WindowEvent { label, event, .. } => {
            if !app.state::<RecorderRuntimeState>().is_active() {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                if label == MAIN_WINDOW_LABEL {
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        let _ = window.hide();
                    }
                    focus_recorder_window(app);
                } else if label == RECORDER_WINDOW_LABEL {
                    api.prevent_close();
                    focus_recorder_window(app);
                }
            }
        }
        RunEvent::ExitRequested { api, .. } if app.state::<RecorderRuntimeState>().is_active() => {
            api.prevent_exit();
            focus_recorder_window(app);
        }
        _ => {}
    }
}

#[tauri::command]
fn request_microphone_access() -> Result<String, String> {
    request_microphone_access_impl()
}

#[cfg(target_os = "macos")]
fn request_microphone_access_impl() -> Result<String, String> {
    use std::sync::mpsc;
    use std::time::Duration;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};

    let media_type =
        unsafe { AVMediaTypeAudio.ok_or_else(|| "microphone_media_type_unavailable".to_string())? };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };

    if status.0 == AVAuthorizationStatus::Authorized.0 {
        return Ok("authorized".into());
    }
    if status.0 == AVAuthorizationStatus::Denied.0 {
        return Err("microphone_denied".into());
    }
    if status.0 == AVAuthorizationStatus::Restricted.0 {
        return Err("microphone_restricted".into());
    }

    let (sender, receiver) = mpsc::channel();
    let completion = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
    });
    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media_type, &completion);
    }

    match receiver.recv_timeout(Duration::from_secs(120)) {
        Ok(true) => Ok("authorized".into()),
        Ok(false) => Err("microphone_denied".into()),
        Err(_) => Err("microphone_request_timeout".into()),
    }
}

#[cfg(not(target_os = "macos"))]
fn request_microphone_access_impl() -> Result<String, String> {
    Ok("unsupported_platform".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recorder_window_has_stable_bootstrap_route() {
        assert_eq!(RECORDER_WINDOW_LABEL, "recorder-window");
        assert_eq!(
            recorder_window_url(),
            "index.html?recorderWindow=1&autostart=1"
        );
    }

    #[test]
    fn recorder_window_layouts_are_bounded() {
        assert_eq!(
            recorder_window_size("expanded").unwrap(),
            (RECORDER_WIDTH, RECORDER_EXPANDED_HEIGHT)
        );
        assert_eq!(
            recorder_window_size("minimized").unwrap(),
            (RECORDER_MINIMIZED_WIDTH, RECORDER_MINIMIZED_HEIGHT)
        );
        assert!(recorder_window_size("other").is_err());
    }

    #[test]
    fn recorder_reopen_url_restarts_the_recorder_route() {
        let url = recorder_window_reopen_url(
            Url::parse("http://127.0.0.1:3100/note/abc?recorderWindow=1").unwrap(),
        );
        assert_eq!(url.path(), "/");
        assert!(url.query().unwrap_or_default().contains("recorderWindow=1"));
        assert!(url.query().unwrap_or_default().contains("autostart=1"));
    }
}
