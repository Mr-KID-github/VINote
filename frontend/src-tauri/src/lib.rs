use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

const RECORDER_WINDOW_LABEL: &str = "recorder-window";
const RECORDER_WINDOW_TITLE: &str = "VINote Meeting Recorder";
const RECORDER_WINDOW_WIDTH: f64 = 390.0;
const RECORDER_WINDOW_HEIGHT: f64 = 230.0;
const RECORDER_WINDOW_EDGE_PADDING: f64 = 24.0;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            request_microphone_access,
            open_recorder_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VINote");
}

fn recorder_window_url() -> &'static str {
    "index.html?recorderWindow=1&autostart=1"
}

fn recorder_window_position(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let position = monitor.position();
    let size = monitor.size();
    let x = position.x + size.width as i32
        - RECORDER_WINDOW_WIDTH as i32
        - RECORDER_WINDOW_EDGE_PADDING as i32;
    let y = position.y + RECORDER_WINDOW_EDGE_PADDING as i32;
    Some(PhysicalPosition::new(x.max(position.x), y.max(position.y)))
}

#[tauri::command]
fn open_recorder_window(app: AppHandle) -> Result<String, String> {
    if let Some(window) = app.get_webview_window(RECORDER_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok("existing".into());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        RECORDER_WINDOW_LABEL,
        WebviewUrl::App(recorder_window_url().into()),
    )
    .title(RECORDER_WINDOW_TITLE)
    .inner_size(RECORDER_WINDOW_WIDTH, RECORDER_WINDOW_HEIGHT)
    .min_inner_size(340.0, 190.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true);

    if let Some(position) = recorder_window_position(&app) {
        builder = builder.position(position.x as f64, position.y as f64);
    }

    let window = builder.build().map_err(|error| error.to_string())?;
    let _ = window.set_focus();
    Ok("created".into())
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
    fn recorder_window_uses_stable_label_and_bootstrap_url() {
        assert_eq!(RECORDER_WINDOW_LABEL, "recorder-window");
        assert_eq!(
            recorder_window_url(),
            "index.html?recorderWindow=1&autostart=1"
        );
    }
}
