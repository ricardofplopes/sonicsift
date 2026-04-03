# SonicSift

<p align="center">
  <img src="docs/logo-banner.svg" alt="SonicSift" width="700"/>
</p>

<p align="center">
  <strong>Local-first desktop app for processing large audio recordings</strong><br/>
  Detect and remove noise/silence · Enhance speech · Export clean audio
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-MVP-blue" alt="Status"/>
  <img src="https://img.shields.io/badge/platform-Windows%20|%20macOS%20|%20Linux-lightgrey" alt="Platform"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License"/>
</p>

## Overview

SonicSift processes very large audio recordings (up to 12 hours) locally on your machine:

1. **Import** a large audio file
2. **Analyze** to detect silence/noise vs. speech segments
3. **Review** detected segments and toggle what to keep
4. **Enhance** kept segments (normalization, noise filtering)
5. **Export** a cleaned, trimmed final file

No cloud. No uploads. Everything runs locally.

## Architecture

```
┌─────────────────────────────────────────┐
│            Tauri Desktop Shell           │
│  ┌───────────────────────────────────┐  │
│  │     React + TypeScript Frontend   │  │
│  │  (Vite, Tailwind CSS, Zustand)    │  │
│  └──────────────┬────────────────────┘  │
│                 │ JSON-over-stdio        │
│  ┌──────────────▼────────────────────┐  │
│  │     Python Sidecar Worker         │  │
│  │  (FFmpeg, Pydantic, Pluggable)    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Rust** >= 1.77 (install via [rustup](https://rustup.rs/))
- **Python** >= 3.11
- **FFmpeg** >= 6.0 (must be on PATH)

### Install prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install pnpm (if not installed)
npm install -g pnpm

# Install FFmpeg
# Windows: winget install FFmpeg
# macOS: brew install ffmpeg
# Linux: sudo apt install ffmpeg
```

## Setup

### 1. Install frontend dependencies

```bash
pnpm install
```

### 2. Set up Python backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Verify FFmpeg

```bash
ffmpeg -version
ffprobe -version
```

## Development

### Run the desktop app (requires Rust)

```bash
pnpm tauri dev
```

### Run frontend only (for UI development)

```bash
pnpm dev
```

Then open http://localhost:1420

### Run the Python worker standalone

```bash
cd backend
python -m sonicsift.main
```

Send JSON commands via stdin:
```json
{"type": "ping", "payload": {}}
```

### Run Python tests

```bash
cd backend
python -m pytest tests/ -v
```

## Project Structure

```
sonicsift/
├── src/                    # React frontend
│   ├── components/         # Reusable UI components
│   ├── pages/              # App pages (Import, Settings, Progress, Review, Export)
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   └── types/              # TypeScript type definitions
├── src-tauri/              # Tauri Rust backend
│   ├── src/                # Rust source code
│   └── tauri.conf.json     # Tauri configuration
├── backend/                # Python audio processing worker
│   ├── sonicsift/          # Python package
│   │   ├── main.py         # Sidecar entry point (JSON stdin/stdout)
│   │   ├── ingest.py       # File validation & metadata
│   │   ├── chunking.py     # Split large files into chunks
│   │   ├── detection.py    # Silence/speech segment detection
│   │   ├── enhance.py      # Pluggable audio enhancement
│   │   ├── assembly.py     # Merge kept segments
│   │   ├── export.py       # Final audio encoding
│   │   ├── ffmpeg.py       # FFmpeg subprocess wrapper
│   │   └── config.py       # Processing configuration
│   └── tests/              # Python tests
├── docker/                 # Optional Docker dev tooling
├── package.json            # Frontend dependencies
├── vite.config.ts          # Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
└── README.md               # This file
```

## Configuration

Default processing settings (adjustable in the UI):

| Setting | Default | Description |
|---------|---------|-------------|
| Silence Threshold | -35 dB | Audio level below which is considered silence |
| Min Silence Duration | 1.0s | Minimum silence length to trigger a cut |
| Kept Padding | 200ms | Padding around speech segments |
| Enhancement Strength | 0.5 | How aggressively to enhance (0–1) |
| Output Format | WAV | Export format (WAV, MP3, FLAC) |

## Communication Protocol

The frontend and Python worker communicate via newline-delimited JSON over stdin/stdout:

**Commands (Frontend → Worker):**
- `analyze` — Start analysis of an audio file
- `export` — Export processed audio
- `cancel` — Cancel current operation
- `ping` — Health check

**Responses (Worker → Frontend):**
- `progress` — Processing progress update
- `segments` — Detected segments list
- `complete` — Job completed with output path
- `error` — Error occurred
- `pong` — Health check response

## Docker (Optional)

For running the Python worker in a container during development:

```bash
cd docker
docker compose -f docker-compose.dev.yml up --build
```

## Next Steps

- [ ] Implement audio preview/playback for segments
- [ ] Add demucs source-separation enhancement pipeline
- [ ] Add job persistence and resume capability
- [ ] Package Python backend as frozen executable (PyInstaller) for standalone distribution
- [ ] Add automated integration tests for the full pipeline
- [ ] Performance optimization for very large files (12+ hours)
- [ ] macOS DMG and Linux AppImage packaging

## License

MIT
