#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![request_microphone_access])
        .run(tauri::generate_context!())
        .expect("error while running VINote");
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

    let media_type = unsafe {
        AVMediaTypeAudio.ok_or_else(|| "microphone_media_type_unavailable".to_string())?
    };
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
