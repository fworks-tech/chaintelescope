#!/usr/bin/env python3
"""Launch the Streamlit app with the project virtual environment when available."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
APP_PATH = REPO_ROOT / "apps" / "python" / "app.py"


def resolve_python() -> Path:
    if os.name == "nt":
        venv_python = REPO_ROOT / ".venv" / "Scripts" / "python.exe"
    else:
        venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.is_file():
        return venv_python
    return Path(sys.executable)


def main(argv: list[str] | None = None) -> int:
    argv = list(argv) if argv is not None else sys.argv[1:]
    python = resolve_python()
    command = [str(python), "-m", "streamlit", "run", str(APP_PATH), *argv]
    return subprocess.call(command, cwd=REPO_ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
