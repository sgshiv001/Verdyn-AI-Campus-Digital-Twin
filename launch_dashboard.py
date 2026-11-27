"""Run Verdyn in VS Code with Python 3.11 or later."""

import argparse
from hashlib import sha256
from pathlib import Path
import subprocess
import sys
from threading import Event, Thread
from urllib.request import urlopen
import venv
import webbrowser


ROOT = Path(__file__).resolve().parent


def open_when_ready(url, stopped):
    for _ in range(120):
        if stopped.wait(0.5):
            return
        try:
            with urlopen(url + "api/health", timeout=1):
                webbrowser.open(url)
            return
        except OSError:
            continue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        parser.error("Python 3.11 or later is required.")
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port between 1024 and 65535.")

    environment = ROOT / ".venv"
    interpreter = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not interpreter.exists():
        venv.create(environment, with_pip=True)
    requirements = ROOT / "requirements.txt"
    marker = environment / "verdyn-requirements.sha256"
    fingerprint = sha256(requirements.read_bytes()).hexdigest()
    if not marker.exists() or marker.read_text(encoding="ascii") != fingerprint:
        subprocess.run([str(interpreter), "-m", "pip", "install", "-r", str(requirements)], cwd=ROOT, check=True)
        marker.write_text(fingerprint, encoding="ascii")

    url = f"http://127.0.0.1:{args.port}/"
    print(f"Verdyn is starting at {url} (Ctrl+C to stop).", flush=True)
    stopped = Event()
    if not args.no_browser:
        Thread(target=open_when_ready, args=(url, stopped), daemon=True).start()
    try:
        return subprocess.call(
            [str(interpreter), "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(args.port)],
            cwd=ROOT,
        )
    finally:
        stopped.set()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
    except KeyboardInterrupt:
        raise SystemExit(130)
