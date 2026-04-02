use std::io::Write;
use std::process::{Command as StdCommand, Stdio};

use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// Spawn the Python backend, send a single JSON command on stdin, and return
/// all of stdout once the process exits.  Each line of stdout is a
/// newline-delimited JSON message that the frontend parses.
#[tauri::command]
async fn run_python(command_json: String) -> Result<String, String> {
    let cwd = std::env::current_dir()
        .map_err(|e| format!("Failed to get working directory: {e}"))?;
    let backend_dir = cwd.join("backend");

    if !backend_dir.exists() {
        return Err(format!(
            "Backend directory not found at '{}'. \
             Make sure you are running from the project root.",
            backend_dir.display()
        ));
    }

    let mut cmd = StdCommand::new("python");
    cmd.args(["-m", "sonicsift.main"])
        .current_dir(&backend_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW – prevents a console window from flashing
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn Python: {e}. Is Python installed and on PATH?")
    })?;

    // Write command and drop stdin so the Python process sees EOF.
    if let Some(mut stdin) = child.stdin.take() {
        writeln!(stdin, "{command_json}")
            .map_err(|e| format!("Failed to write to Python stdin: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to wait for Python process: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !stderr.is_empty() {
        eprintln!("[Python stderr]: {stderr}");
    }

    if !output.status.success() {
        return Err(format!(
            "Python process exited with code {:?}.\nStderr: {stderr}\nStdout: {stdout}",
            output.status.code(),
        ));
    }

    Ok(stdout)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_app_data_dir, run_python])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
