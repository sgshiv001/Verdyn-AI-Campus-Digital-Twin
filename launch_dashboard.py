"""Build and start Verdyn from the VS Code terminal or Run Python File."""

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import webbrowser
from threading import Event, Thread


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"


def open_when_ready(url, port, stopped):
    for _ in range(120):
        if stopped.wait(0.5):
            return
        try:
            with socket.create_connection((HOST, port), timeout=0.5):
                webbrowser.open(url)
            return
        except OSError:
            continue


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173, choices=range(1024, 65536), metavar="1024-65535")
    parser.add_argument("--no-browser", action="store_true", help="Print the local URL without opening it.")
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".wrangler/vscode", help="Directory for the local database.")
    args = parser.parse_args()

    node = shutil.which("node")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not node or not npm:
        parser.exit(1, "Verdyn requires Node.js 22.13 or later and npm on your PATH.\n")

    with socket.socket() as listener:
        try:
            listener.bind((HOST, args.port))
        except OSError:
            parser.exit(1, f"Port {args.port} is in use. Try python launch_dashboard.py --port 5174.\n")

    wrangler_path = ROOT / "node_modules/wrangler/bin/wrangler.js"
    if not wrangler_path.is_file() or not (ROOT / "node_modules/vinext/dist/cli.js").is_file():
        subprocess.run([npm, "run", "install:ci"], cwd=ROOT, check=True)

    subprocess.run([node, "scripts/run-framework.mjs", "build"], cwd=ROOT, check=True)
    config_path = ROOT / "dist/server/wrangler.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    binding = next(database for database in config["d1_databases"] if database["binding"] == "DB")
    binding["migrations_dir"] = "../../drizzle"
    launch_config = config_path.with_name("wrangler.vscode.json")
    launch_config.write_text(json.dumps(config), encoding="utf-8")

    wrangler = [node, "--import", "./scripts/sites-env.mjs", str(wrangler_path)]
    local_flags = ["--local", "--config", str(launch_config), "--persist-to", str(args.data_dir.resolve())]
    subprocess.run(
        [*wrangler, "d1", "migrations", "apply", "DB", *local_flags],
        cwd=ROOT,
        check=True,
        stdin=subprocess.DEVNULL,
        env={**os.environ, "CI": "true"},
    )

    url = f"http://{HOST}:{args.port}/"
    print(f"Verdyn is starting at {url} (Ctrl+C to stop).", flush=True)
    stopped = Event()
    if not args.no_browser:
        Thread(target=open_when_ready, args=(url, args.port, stopped), daemon=True).start()
    try:
        return subprocess.call(
            [*wrangler, "dev", *local_flags, "--ip", HOST, "--port", str(args.port), "--inspector-port", "0"],
            cwd=ROOT,
        )
    finally:
        stopped.set()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.returncode)
