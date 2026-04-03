# Copilot Instructions — SonicSift

## Build, Test & Run

```bash
# Frontend (React + Vite)
pnpm build                    # TypeScript check + Vite production build
pnpm dev                      # Dev server at http://localhost:1420

# Full desktop app (Tauri + frontend + Rust)
pnpm tauri dev                # Development mode with hot reload
pnpm tauri build              # Release build → src-tauri/target/release/bundle/nsis/

# Python backend
cd backend
python -m pytest tests/ -v                                          # All tests
python -m pytest tests/test_detection.py -v                         # Single file
python -m pytest tests/test_detection.py::TestApplyPadding::test_padding_extends_speech -v  # Single test
python -m sonicsift.main                                            # Run worker standalone (reads JSON from stdin)
```

Prerequisites: Node ≥20, pnpm ≥9, Rust ≥1.77, Python ≥3.11, FFmpeg ≥6.0 on PATH.

## Architecture

SonicSift is a local-first desktop app for processing large audio files (up to 12h). It uses a **three-layer** architecture:

```
React Frontend ──invoke()──▶ Tauri Rust Commands ──spawn──▶ Python Worker
    (UI)              (desktop shell)              (audio processing)
```

### Frontend → Python communication flow

1. UI calls `sendCommand(type, payload)` from the `useSidecar` hook
2. `buildPythonPayload()` translates camelCase → snake_case and nests settings under a `config` key
3. Tauri `invoke("run_python", { commandJson })` calls the Rust `run_python` command
4. Rust spawns `python -m sonicsift.main`, writes JSON to stdin, closes stdin
5. Python reads the command, processes it, writes newline-delimited JSON responses to stdout
6. Rust collects all stdout and returns it as a string
7. `translatePythonMessage()` maps Python message types back to frontend format
8. `handleMessage()` dispatches to the Zustand store, triggering React re-renders

Each Python invocation is a **short-lived process** — there is no persistent sidecar.

### JSON protocol translation

The `useSidecar` hook translates between frontend and Python naming conventions:

| Direction | Frontend | Python |
|-----------|----------|--------|
| → | `inputPath` | `filePath` |
| → | `silenceThresholdDb` | `config.silence_threshold_db` |
| ← | `progress.progress` | `progress.percent` |
| ← | `progress.phase` | `progress.stage` |
| ← | `segments` (type) | `analyzeResult` (type) |
| ← | `complete` (type) | `exportResult` (type) |

### Python processing pipeline

The export handler runs: extract segments → enhance each → assemble → encode output.

Enhancement uses a pluggable pipeline pattern (`EnhancementPipeline` ABC in `enhance.py`):
- `"default"` — FFmpeg loudnorm ± highpass filter
- `"noisereduce"` — spectral gating via `noisereduce` library + normalization

Select with `get_pipeline(name)`.

### State management

Two Zustand stores with no async middleware:
- **jobStore** — workflow state machine: `idle → analyzing → reviewing → exporting → complete | error`
- **settingsStore** — processing config (thresholds, format, strength)

Async logic lives in hooks/components, not in stores.

## Key Conventions

### Frontend

- **Styling**: Tailwind CSS only (no CSS modules). Dark theme default (gray-900 backgrounds, gray-100 text). Custom `sonic` color palette for brand blue (`sonic-500: #3d6bff`).
- **Fonts**: Inter (sans) and JetBrains Mono (mono), configured in `tailwind.config.js`.
- **Icons**: Inline SVG elements in JSX. No icon library, no emojis. Use `viewBox="0 0 20 20"`, `fill="none"`, `stroke="currentColor"`, `strokeWidth="1.5"`.
- **Path alias**: `@/*` maps to `src/*` (configured in both tsconfig.json and vite.config.ts).
- **Component pattern**: Pages in `src/pages/`, reusable components in `src/components/`. Sidebar steps define a `canNavigate()` function controlling the workflow progression.

### Python backend

- **Type hints**: Always use `from __future__ import annotations` and full type annotations.
- **Data structures**: `@dataclass` for domain models (e.g., `Segment`), Pydantic `BaseSettings` for configuration.
- **Logging**: Module-level `log = logging.getLogger(__name__)`. All logs go to stderr (stdout is reserved for JSON IPC).
- **FFmpeg**: All audio operations go through `ffmpeg.py` wrapper functions. Never call FFmpeg directly from other modules.
- **Lazy imports**: Optional heavy dependencies (numpy, noisereduce, scipy) are imported inside the method that uses them, not at module top level.

### Tauri / Rust

- **Tauri v2** — permissions go in `src-tauri/capabilities/default.json`, **not** in `plugins` config in `tauri.conf.json`.
- **Bundle target**: NSIS only (`"targets": ["nsis"]`). WiX/MSI is not used.
- **Backend discovery**: `find_backend_dir()` searches resource dir → exe dir → CWD, supporting both installed and development modes.
- **Windows**: `CREATE_NO_WINDOW` flag (`0x0800_0000`) on spawned Python processes to prevent console flash.
