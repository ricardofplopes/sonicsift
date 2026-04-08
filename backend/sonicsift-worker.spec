# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the SonicSift worker executable.

Produces a single-file executable at dist/sonicsift-worker.exe that bundles
the entire Python backend and its dependencies.

Usage:
    cd backend
    pyinstaller sonicsift-worker.spec
"""

a = Analysis(
    ["sonicsift/main.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # ---- pydantic / pydantic-settings ----
        "pydantic",
        "pydantic_settings",
        "pydantic._internal",
        "pydantic._internal._core_utils",
        "pydantic._internal._generate_schema",
        "pydantic._internal._validators",
        "pydantic._internal._fields",
        "pydantic._internal._config",
        "pydantic.deprecated",
        "pydantic.deprecated.parse",
        # ---- noisereduce (lazy-imported) ----
        "noisereduce",
        "noisereduce.noisereduce",
        # ---- numpy ----
        "numpy",
        "numpy.core",
        "numpy.core._multiarray_umath",
        # ---- scipy (lazy-imported) ----
        "scipy",
        "scipy.io",
        "scipy.io.wavfile",
        "scipy.signal",
        # ---- stdlib modules used at runtime ----
        "json",
        "logging",
        "threading",
        "dataclasses",
        "abc",
        "tempfile",
        "shutil",
        "re",
        "pathlib",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary heavy modules to reduce bundle size
        "tkinter",
        "matplotlib",
        "PIL",
        "IPython",
        "notebook",
        "sphinx",
        "pytest",
        "setuptools",
        "pip",
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="sonicsift-worker",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    # console=True is required: the worker reads JSON from stdin and writes to stdout
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
