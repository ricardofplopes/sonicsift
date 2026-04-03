use std::io::{BufRead, Read, Write};
use std::process::{Command as StdCommand, Stdio};

use tauri::Emitter;
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

/// Find the backend directory by searching multiple locations.
fn find_backend_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    // 1. Resource dir (bundled app via NSIS installer)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let backend = resource_dir.join("backend");
        if backend.join("sonicsift").exists() {
            return Ok(backend);
        }
    }

    // 2. Next to the executable (portable / dev build)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let backend = exe_dir.join("backend");
            if backend.join("sonicsift").exists() {
                return Ok(backend);
            }
        }
    }

    // 2b. Walk up from exe directory (handles dev builds: src-tauri/target/release/)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(|p| p.to_path_buf());
        for _ in 0..6 {
            match dir {
                Some(ref d) => {
                    let backend = d.join("backend");
                    if backend.join("sonicsift").exists() {
                        return Ok(backend);
                    }
                    dir = d.parent().map(|p| p.to_path_buf());
                }
                None => break,
            }
        }
    }

    // 3. Current working directory (development: pnpm tauri dev)
    if let Ok(cwd) = std::env::current_dir() {
        let backend = cwd.join("backend");
        if backend.join("sonicsift").exists() {
            return Ok(backend);
        }
    }

    Err(format!(
        "Backend directory not found. Searched resource dir, exe ancestors (up to 6 levels), and CWD. \
         Make sure the 'backend/sonicsift/' directory exists relative to the executable or project root."
    ))
}

/// Spawn the Python backend, send a single JSON command on stdin, and return
/// all of stdout once the process exits.  Each line of stdout is a
/// newline-delimited JSON message that the frontend parses.
#[tauri::command]
async fn run_python(app: tauri::AppHandle, command_json: String) -> Result<String, String> {
    let backend_dir = find_backend_dir(&app)?;

    let mut cmd = StdCommand::new("python");
    cmd.args(["-m", "sonicsift.main"])
        .current_dir(&backend_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Ensure the spawned Python process inherits a complete PATH that
    // includes common tool locations (e.g. FFmpeg installed via winget).
    #[cfg(target_os = "windows")]
    {
        use std::env;
        if let Ok(sys_path) = env::var("PATH") {
            // Also check well-known winget/scoop/chocolatey locations
            let mut paths = sys_path;
            let home = env::var("USERPROFILE").unwrap_or_default();
            let extra_dirs = [
                format!(r"{home}\AppData\Local\Microsoft\WinGet\Links"),
                format!(r"{home}\scoop\shims"),
                r"C:\ProgramData\chocolatey\bin".to_string(),
            ];
            for d in &extra_dirs {
                if !paths.contains(d.as_str()) && std::path::Path::new(d).exists() {
                    paths = format!("{paths};{d}");
                }
            }
            cmd.env("PATH", &paths);
        }
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

    // Take stdout and stderr handles before reading so we can stream stdout
    // line-by-line and still capture stderr after the process exits.
    let child_stdout = child.stdout.take();
    let child_stderr = child.stderr.take();

    // Read stdout line by line and emit events for real-time progress
    let mut all_output = String::new();
    if let Some(stdout) = child_stdout {
        let reader = std::io::BufReader::new(stdout);
        for line_result in reader.lines() {
            match line_result {
                Ok(line) => {
                    let _ = app.emit("python-output", &line);
                    all_output.push_str(&line);
                    all_output.push('\n');
                }
                Err(e) => {
                    eprintln!("[Python stdout read error]: {e}");
                    break;
                }
            }
        }
    }

    let mut stderr = String::new();
    if let Some(mut err_stream) = child_stderr {
        let _ = err_stream.read_to_string(&mut stderr);
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for Python process: {e}"))?;

    if !stderr.is_empty() {
        eprintln!("[Python stderr]: {stderr}");
    }

    if !status.success() {
        return Err(format!(
            "Python process exited with code {:?}.\nStderr: {stderr}\nStdout: {all_output}",
            status.code(),
        ));
    }

    Ok(all_output)
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
