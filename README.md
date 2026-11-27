# Verdyn · Campus intelligence

Verdyn is a demo-first campus resource management dashboard for facilities teams. It helps teams compare buildings, forecast demand, detect unusual usage, review data quality, and turn findings into an action plan.

The active application is Python + FastAPI served by Uvicorn. Node.js is not required.

## Requirements

- Python 3.11 or newer
- A modern browser

## Run in VS Code

Open `launch_dashboard.py` and select **Run Python File**, or run `python launch_dashboard.py` from the VS Code terminal. It creates the local environment, installs dependencies, and opens the dashboard at http://127.0.0.1:8000. Use `--port 8001` if the default port is busy.

## Windows setup

Open PowerShell in this folder and run:

```powershell
.\start.ps1
```

The script creates `.venv`, installs the Python dependencies, and starts Uvicorn at `http://127.0.0.1:8000`.

For a manual setup:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks scripts, run this once for the current user, then retry:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## macOS setup

Open Terminal in this folder and run:

```bash
chmod +x start.sh
./start.sh
```

Or manually:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Then open `http://127.0.0.1:8000`.

## Demo workflow

The app opens immediately with the supplied simulated campus archive: 10 buildings and two years of hourly electricity and water data. Use the dataset selector in the top bar to switch datasets.

Open `/imports` and select one or more UTF-8 CSVs of up to 10 MB each. Verdyn validates each file, reports its result, saves it under `data/uploads`, and loads the last valid dataset. Each file can be opened separately from the dataset selector after a restart.

For the standard Verdyn format, use `recorded_at,building,resource,value,unit` with hourly IST timestamps. Use `energy` with `kWh` or `water` with `kL`.

Supported column names include:

- Timestamp: `timestamp_local`, `timestamp`, `recorded_at`, or `datetime`
- Building: `building_name`, `building`, `building_id`, or `site`
- Energy: `electricity_kwh`, `energy_kwh`, `energy`, or `kwh`
- Water: `water_liters`, `water_kl`, `water`, or `kl`

## Pages

- `/` — overview
- `/buildings` — full building comparison
- `/insights` — trends, forecasts, and signals
- `/actions` — facilities action plan
- `/quality` — data quality review
- `/imports` — upload and switch datasets

## API

- `GET /api/health`
- `GET /api/dashboard?dataset=demo`
- `GET /api/datasets`
- `POST /api/import`
- `POST /api/actions/{action_id}/toggle`

The files in `data/demo` are explicitly labeled `SIMULATED_DEMO_NOT_MEASURED`. They are for product demonstrations and testing only, not live campus readings.
