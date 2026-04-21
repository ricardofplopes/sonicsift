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

/// How the Python backend worker should be launched.
enum WorkerMode {
    /// Frozen PyInstaller executable – spawn it directly.
    FrozenExe(std::path::PathBuf),
    /// Development mode – invoke `python -m sonicsift.main` inside this dir.
    PythonModule(std::path::PathBuf),
}

/// Locate the backend worker, preferring a frozen executable over Python.
fn find_worker(app: &tauri::AppHandle) -> Result<WorkerMode, String> {
    let frozen_name = if cfg!(target_os = "windows") {
        "sonicsift-worker.exe"
    } else {
        "sonicsift-worker"
    };

    // --- Frozen executable search ---

    // 1. Resource dir (bundled app via NSIS installer)
    if let Ok(resource_dir) = app.path().resource_dir() {
        // Check root and bin/ subdirectory
        for subdir in &["", "bin"] {
            let dir = resource_dir.join(subdir);
            let exe = dir.join(frozen_name);
            if exe.is_file() {
                return Ok(WorkerMode::FrozenExe(exe));
            }
        }
    }

    // 2. Next to the application executable
    if let Ok(app_exe) = std::env::current_exe() {
        if let Some(exe_dir) = app_exe.parent() {
            let exe = exe_dir.join(frozen_name);
            if exe.is_file() {
                return Ok(WorkerMode::FrozenExe(exe));
            }
        }
    }

    // 2b. Walk up from exe directory (dev build with pre-built worker)
    if let Ok(app_exe) = std::env::current_exe() {
        let mut dir = app_exe.parent().map(|p| p.to_path_buf());
        for _ in 0..6 {
            match dir {
                Some(ref d) => {
                    let exe = d.join("backend").join("dist").join(frozen_name);
                    if exe.is_file() {
                        return Ok(WorkerMode::FrozenExe(exe));
                    }
                    dir = d.parent().map(|p| p.to_path_buf());
                }
                None => break,
            }
        }
    }

    // 3. CWD (development with pre-built worker)
    if let Ok(cwd) = std::env::current_dir() {
        let exe = cwd.join("backend").join("dist").join(frozen_name);
        if exe.is_file() {
            return Ok(WorkerMode::FrozenExe(exe));
        }
    }

    // --- Python module fallback (development) ---

    // Walk up from exe directory
    if let Ok(app_exe) = std::env::current_exe() {
        let mut dir = app_exe.parent().map(|p| p.to_path_buf());
        for _ in 0..6 {
            match dir {
                Some(ref d) => {
                    let backend = d.join("backend");
                    if backend.join("sonicsift").exists() {
                        return Ok(WorkerMode::PythonModule(backend));
                    }
                    dir = d.parent().map(|p| p.to_path_buf());
                }
                None => break,
            }
        }
    }

    // CWD fallback
    if let Ok(cwd) = std::env::current_dir() {
        let backend = cwd.join("backend");
        if backend.join("sonicsift").exists() {
            return Ok(WorkerMode::PythonModule(backend));
        }
    }

    Err(
        "Backend worker not found. Searched for frozen executable (sonicsift-worker) \
         in resource dir, exe ancestors, and CWD; then searched for Python module \
         (backend/sonicsift/) in exe ancestors and CWD."
            .to_string(),
    )
}

/// Apply Windows-specific PATH and creation-flag tweaks to the command.
#[cfg(target_os = "windows")]
fn apply_windows_flags(cmd: &mut StdCommand) {
    use std::env;
    if let Ok(sys_path) = env::var("PATH") {
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
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}

/// Spawn the backend worker, send a single JSON command on stdin, and return
/// all of stdout once the process exits.  Each line of stdout is a
/// newline-delimited JSON message that the frontend parses.
#[tauri::command]
async fn run_python(app: tauri::AppHandle, command_json: String) -> Result<String, String> {
    let worker = find_worker(&app)?;

    let mut cmd = match &worker {
        WorkerMode::FrozenExe(exe_path) => {
            StdCommand::new(exe_path)
        }
        WorkerMode::PythonModule(backend_dir) => {
            let mut c = StdCommand::new("python");
            c.args(["-m", "sonicsift.main"]);
            c.current_dir(backend_dir);
            c
        }
    };

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    apply_windows_flags(&mut cmd);

    let spawn_desc = match &worker {
        WorkerMode::FrozenExe(p) => format!("frozen exe: {}", p.display()),
        WorkerMode::PythonModule(p) => format!("python -m sonicsift.main in {}", p.display()),
    };

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn worker ({spawn_desc}): {e}")
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
