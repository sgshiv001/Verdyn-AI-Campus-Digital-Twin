from __future__ import annotations

import csv
import glob
from hashlib import sha256
import math
import random
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from threading import Lock

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from campus_csv import IST, parse_readings, summarize_upload

ROOT = Path(__file__).resolve().parent

app = FastAPI(title="Verdyn", version="2.0.0")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
UPLOAD_DIR = ROOT / "data" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

BUILDINGS = [
    {"id": "library", "name": "Central Library", "short": "LIB", "area": "18,400 m²", "occupancy": "82%", "color": "lime"},
    {"id": "science", "name": "Science Block", "short": "SCI", "area": "22,100 m²", "occupancy": "76%", "color": "cyan"},
    {"id": "admin", "name": "Admin Tower", "short": "ADM", "area": "9,600 m²", "occupancy": "64%", "color": "orange"},
    {"id": "hostel", "name": "Residential North", "short": "RES", "area": "31,800 m²", "occupancy": "91%", "color": "violet"},
]


def make_series(seed: int, base: float, spread: float, anomaly_at: int | None = None) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    now = datetime.now(IST).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(days=13)
    result = []
    for i in range(14 * 24):
        hour = i % 24
        daylight = max(0, math.sin((hour - 6) / 12 * math.pi))
        evening = max(0, math.sin((hour - 16) / 8 * math.pi))
        value = base + spread * (0.35 * daylight + 0.18 * evening) + rng.uniform(-spread * .08, spread * .08)
        if anomaly_at == i:
            value *= 1.78
        result.append({"timestamp": (start + timedelta(hours=i)).isoformat(), "value": round(max(value, 0.1), 2)})
    return result


def demo_payload() -> dict[str, Any]:
    building_rows = []
    energy_totals = [46820, 52140, 28760, 69880]
    water_totals = [18640, 22480, 9420, 30120]
    efficiency = [91, 84, 96, 78]
    for index, building in enumerate(BUILDINGS):
        building_rows.append({
            **building,
            "energy": energy_totals[index], "water": water_totals[index],
            "efficiency": efficiency[index], "change": ["-8.4%", "+3.1%", "-12.8%", "+6.7%"][index],
            "status": "Healthy" if efficiency[index] >= 90 else ("Watch" if efficiency[index] >= 82 else "Needs review"),
        })
    alerts = [
        {"id": "a-1", "severity": "high", "building": "Science Block", "title": "Unusual cooling demand", "detail": "Energy draw is 41% above the same-hour baseline.", "time": "Today · 14:00 IST", "score": 92},
        {"id": "a-2", "severity": "medium", "building": "Residential North", "title": "Night-time water flow", "detail": "A 2.4 kL reading at 03:00 is outside the normal range.", "time": "Yesterday · 03:00 IST", "score": 81},
        {"id": "a-3", "severity": "low", "building": "Admin Tower", "title": "Coverage gap detected", "detail": "Three hourly readings are missing from the latest export.", "time": "Yesterday · data quality", "score": 68},
    ]
    return {
        "account": {"name": "Demo campus", "email": "demo@verdyn.app", "mode": "Demo data", "campus": "Northstar University"},
        "updated": "Just now",
        "kpis": {"energy": 197600, "energy_change": -4.8, "water": 80660, "water_change": 2.3, "coverage": 98.6, "alerts": 3, "buildings": 4},
        "buildings": building_rows,
        "alerts": alerts,
        "actions": [
            {"id": "act-1", "title": "Review Science Block HVAC schedule", "detail": "Compare the 13:00–16:00 load against room bookings before changing the setpoint.", "owner": "Facilities", "priority": "High", "due": "Today", "done": False},
            {"id": "act-2", "title": "Inspect Residential North water line", "detail": "Verify the overnight spike at the basement sub-meter and check for a slow leak.", "owner": "Maintenance", "priority": "Medium", "due": "Tomorrow", "done": False},
            {"id": "act-3", "title": "Request a clean Admin Tower export", "detail": "Fill the three missing hourly slots before using this building in a monthly comparison.", "owner": "Data quality", "priority": "Low", "due": "Friday", "done": True},
        ],
        "chart": {"energy": make_series(21, 410, 260, 302), "water": make_series(44, 135, 84, 315)},
        "forecast": {"energy": {"total": 14280, "unit": "kWh", "confidence": 87, "peak": "14:00", "direction": "-6.2%"}, "water": {"total": 5810, "unit": "kL", "confidence": 82, "peak": "07:00", "direction": "+1.4%"}},
        "insight": {"title": "The campus is trending better, with one exception", "body": "Energy is down 4.8% week over week. Science Block is the only building moving against the trend, driven by afternoon cooling demand.", "saving": "12.4%", "saving_label": "avoidable demand identified"},
    }


def load_archive_demo() -> dict[str, Any]:
    """Use the supplied archive when present; the archive is explicitly simulated."""
    data_dir = ROOT / "data" / "demo"
    monthly = sorted(glob.glob(str(data_dir / "verdyn_*.csv")))
    metadata = data_dir / "buildings.csv"
    if not monthly or not metadata.exists():
        return demo_payload()
    names: dict[str, str] = {}
    with metadata.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            names[row["building_id"]] = row["building_name"]
    rows: list[dict[str, Any]] = []
    available_dates = set()
    for filename in reversed(monthly):
        with open(filename, newline="", encoding="utf-8-sig") as handle:
            for row in csv.DictReader(handle):
                rows.append(row)
                available_dates.add(row["timestamp_local"][:10])
        if len(available_dates) >= 14:
            break
    dates = sorted({row["timestamp_local"][:10] for row in rows})
    recent_dates = set(dates[-14:])
    recent = [row for row in rows if row["timestamp_local"][:10] in recent_dates]
    by_building: dict[str, list[dict[str, Any]]] = {}
    for row in recent:
        by_building.setdefault(row["building_id"], []).append(row)
    colors = ["lime", "cyan", "orange", "violet"]
    occupancy = ["78%", "73%", "88%", "92%", "86%", "69%", "81%", "64%", "57%", "76%"]
    buildings = []
    for index, building_id in enumerate(sorted(names)):
        items = by_building[building_id]
        energy = sum(float(item["electricity_kwh"]) for item in items)
        water = sum(float(item["water_liters"]) for item in items) / 1000
        buildings.append({
            "id": building_id.lower(), "name": names[building_id], "short": building_id,
            "area": f"{(7.2 + index * 1.8):.1f}k m²", "occupancy": occupancy[index],
            "color": colors[index % len(colors)], "energy": round(energy), "water": round(water),
            "efficiency": max(72, min(98, 96 - index * 2)),
            "change": ["-5.8%", "+2.9%", "-8.1%", "+4.4%", "-2.7%", "+1.8%", "-6.4%", "-3.2%", "+5.1%", "-1.9%"][index],
            "status": "Healthy" if index % 4 in (0, 2) else ("Watch" if index % 4 == 1 else "Needs review"),
        })
    daily_energy: dict[str, float] = {day: 0 for day in recent_dates}
    daily_water: dict[str, float] = {day: 0 for day in recent_dates}
    for row in recent:
        day = row["timestamp_local"][:10]
        daily_energy[day] += float(row["electricity_kwh"])
        daily_water[day] += float(row["water_liters"]) / 1000
    chart_energy = [{"timestamp": day, "value": round(daily_energy[day])} for day in sorted(daily_energy)]
    chart_water = [{"timestamp": day, "value": round(daily_water[day])} for day in sorted(daily_water)]
    energy_total = round(sum(daily_energy.values()))
    water_total = round(sum(daily_water.values()))
    return {
        "account": {"name": "Demo campus", "email": "demo@verdyn.app", "mode": "Simulated archive", "campus": "Demo Campus"},
        "updated": "Just now", "kpis": {"energy": energy_total, "energy_change": -4.8, "water": water_total, "water_change": 2.3, "coverage": 100, "alerts": 3, "buildings": len(buildings)},
        "buildings": buildings,
        "alerts": [
            {"id": "a-1", "severity": "high", "building": "Computer Lab", "title": "Unusual electricity demand", "detail": "The latest afternoon load is above its same-hour baseline.", "time": "Latest period · 14:00 IST", "score": 92},
            {"id": "a-2", "severity": "medium", "building": "Hostel A", "title": "Night-time water flow", "detail": "Overnight water use is higher than the campus pattern.", "time": "Latest period · 03:00 IST", "score": 81},
            {"id": "a-3", "severity": "low", "building": "Administration", "title": "Review period comparison", "detail": "This building has the lowest energy intensity in the archive.", "time": "Latest period · comparison", "score": 68},
        ],
        "actions": [
            {"id": "act-1", "title": "Review Computer Lab cooling schedule", "detail": "Compare the afternoon load against room bookings before changing setpoints.", "owner": "Facilities", "priority": "High", "due": "Today", "done": False},
            {"id": "act-2", "title": "Inspect Hostel A water line", "detail": "Verify the overnight spike at the sub-meter and check for a slow leak.", "owner": "Maintenance", "priority": "Medium", "due": "Tomorrow", "done": False},
            {"id": "act-3", "title": "Review source coverage", "detail": "The supplied archive is complete, but is simulated and should not be treated as measured data.", "owner": "Data quality", "priority": "Low", "due": "Friday", "done": True},
        ],
        "chart": {"energy": chart_energy, "water": chart_water},
        "forecast": {"energy": {"total": round(energy_total / 14), "unit": "kWh", "confidence": 90, "peak": "14:00", "direction": "-4.8%"}, "water": {"total": round(water_total / 14), "unit": "kL", "confidence": 88, "peak": "07:00", "direction": "+2.3%"}},
        "insight": {"title": "The campus is trending better, with one exception", "body": "The supplied two-year archive gives Verdyn enough context to compare ten buildings. Computer Lab shows the clearest afternoon demand signal.", "saving": "12.4%", "saving_label": "avoidable demand identified"},
    }


DATA = load_archive_demo()
DATASETS: dict[str, dict[str, Any]] = {"demo": {"id": "demo", "name": "Verdyn demo archive", "rows": 175440, "mode": "Simulated · 2024–2025"}}
UPLOADED: dict[str, dict[str, Any]] = {}


UPLOAD_LIMIT = 10 * 1024 * 1024
IMPORT_LOCK = Lock()


def register_upload(dataset_id, filename, readings, payload):
    UPLOADED[dataset_id] = payload
    DATASETS[dataset_id] = {
        "id": dataset_id, "name": filename, "rows": len(readings), "mode": "Uploaded CSV",
    }


for saved_file in sorted(UPLOAD_DIR.glob("upload-*.csv")):
    match = re.fullmatch(r"(upload-(?:[a-f0-9]{64}|\d+))-(.+)", saved_file.name)
    if not match:
        continue
    saved_id, original_name = match.groups()
    try:
        readings = parse_readings(saved_file.read_bytes())
        register_upload(saved_id, original_name, readings, summarize_upload(readings, original_name))
    except (OSError, UnicodeError, csv.Error, ValueError):
        continue


@app.get("/")
@app.get("/buildings")
@app.get("/actions")
@app.get("/insights")
@app.get("/imports")
@app.get("/quality")
def index() -> FileResponse:
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "runtime": "uvicorn", "mode": "demo"}


@app.get("/api/datasets")
def datasets() -> list[dict[str, Any]]:
    with IMPORT_LOCK:
        return list(DATASETS.values())


@app.get("/api/dashboard")
def dashboard(dataset: str = "demo") -> dict[str, Any]:
    if dataset == "demo":
        return DATA
    if dataset not in UPLOADED:
        raise HTTPException(404, "This dataset is no longer available.")
    return UPLOADED[dataset]


@app.post("/api/actions/{action_id}/toggle")
def toggle_action(action_id: str, dataset: str = "demo") -> dict[str, Any]:
    target = dashboard(dataset)
    for action in target["actions"]:
        if action["id"] == action_id:
            action["done"] = not action["done"]
            return action
    raise HTTPException(404, "Action not found.")


@app.post("/api/import", status_code=201)
def import_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = (file.filename or "uploaded.csv").replace("\\", "/").rsplit("/", 1)[-1]
    if not filename.lower().endswith(".csv"):
        raise HTTPException(422, "Choose a .csv file.")
    raw = file.file.read(UPLOAD_LIMIT + 1)
    if len(raw) > UPLOAD_LIMIT:
        raise HTTPException(413, "Each file can be up to 10 MB.")
    try:
        readings = parse_readings(raw)
        payload = summarize_upload(readings, filename)
    except UnicodeDecodeError as error:
        raise HTTPException(422, "Save the file as UTF-8 CSV and try again.") from error
    except (csv.Error, ValueError) as error:
        raise HTTPException(422, str(error)) from error

    dataset_id = "upload-" + sha256(raw).hexdigest()
    with IMPORT_LOCK:
        if dataset_id not in DATASETS:
            # Use a bounded name on disk and replace atomically after a complete write.
            stem = re.sub(r"[^\w. -]", "_", filename[:-4])[:80] or "uploaded"
            target = UPLOAD_DIR / f"{dataset_id}-{stem}.csv"
            temporary = target.with_suffix(".tmp")
            try:
                temporary.write_bytes(raw)
                temporary.replace(target)
            except OSError as error:
                raise HTTPException(503, "The CSV could not be saved. Check local disk access and retry.") from error
            register_upload(dataset_id, filename, readings, payload)
        return {"id": dataset_id, "filename": filename, "rows": len(readings)}
