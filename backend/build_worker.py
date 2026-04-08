"""Build the frozen SonicSift worker executable with PyInstaller.

Usage:
    cd backend
    python build_worker.py

Output:
    dist/sonicsift-worker.exe   (single-file frozen executable)
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    backend_dir = Path(__file__).resolve().parent
    spec_file = backend_dir / "sonicsift-worker.spec"
    dist_dir = backend_dir / "dist"

    if not spec_file.exists():
        print(f"ERROR: spec file not found: {spec_file}", file=sys.stderr)
        sys.exit(1)

    # Clean previous build artifacts
    for d in (backend_dir / "build",):
        if d.exists():
            print(f"Cleaning {d} ...")
            shutil.rmtree(d)

    exe_name = "sonicsift-worker.exe" if sys.platform == "win32" else "sonicsift-worker"
    old_exe = dist_dir / exe_name
    if old_exe.exists():
        old_exe.unlink()

    print("Running PyInstaller ...")
    result = subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--noconfirm", str(spec_file)],
        cwd=str(backend_dir),
    )

    if result.returncode != 0:
        print("ERROR: PyInstaller failed.", file=sys.stderr)
        sys.exit(result.returncode)

    # Verify the output
    exe_path = dist_dir / exe_name
    if not exe_path.exists():
        print(f"ERROR: Expected output not found: {exe_path}", file=sys.stderr)
        sys.exit(1)

    size_mb = exe_path.stat().st_size / (1024 * 1024)
    print(f"\nBuild successful!")
    print(f"  Executable: {exe_path}")
    print(f"  Size: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
