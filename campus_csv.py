from collections import defaultdict
import csv
from datetime import datetime, timedelta, timezone
import io
import math
from statistics import median


IST = timezone(timedelta(hours=5, minutes=30))
RESOURCES = ("energy", "water")


def parse_readings(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
    fields = [header.strip().lower() for header in reader.fieldnames or []]
    if len(set(fields)) != len(fields):
        raise ValueError("The CSV has duplicate column names.")
    reader.fieldnames = fields

    def column(*names):
        return next((name for name in names if name in fields), None)

    timestamp_col = column("timestamp_local", "timestamp", "recorded_at", "datetime")
    building_col = column("building_name", "building", "building_id", "site")
    canonical = {"resource", "value", "unit"}.issubset(fields)
    columns = {
        "energy": column("electricity_kwh", "energy_kwh", "energy", "kwh"),
        "water": column("water_liters", "water_kl", "water", "kl"),
    }
    if not timestamp_col or not building_col or not (canonical or any(columns.values())):
        raise ValueError("Use recorded_at, building, resource, value, unit or separate energy and water columns.")

    readings = {}
    for row in reader:
        try:
            if None in row or any(value is None for value in row.values()):
                raise ValueError("The row does not match the header.")
            timestamp = datetime.fromisoformat(row[timestamp_col].strip())
            timestamp = timestamp.astimezone(IST) if timestamp.tzinfo else timestamp.replace(tzinfo=IST)
            if timestamp.minute or timestamp.second or timestamp.microsecond:
                raise ValueError("Use hourly timestamps aligned to IST.")
            building = row[building_col].strip()
            if not building:
                raise ValueError("Enter a building name.")
            if canonical:
                resource = row["resource"].strip().lower()
                unit = row["unit"].strip().lower()
                if (resource, unit) not in {("energy", "kwh"), ("water", "kl")}:
                    raise ValueError("Use kWh for energy and kL for water.")
                inputs = [(resource, row["value"], 1)]
            else:
                inputs = [(resource, row[name], 1000 if name == "water_liters" else 1)
                          for resource, name in columns.items() if name and row[name].strip()]
                if not inputs:
                    raise ValueError("Enter a consumption value.")
            for resource, value, divisor in inputs:
                consumption = float(value) / divisor
                if not math.isfinite(consumption) or consumption < 0 or consumption > 1_000_000:
                    raise ValueError("Consumption must be between 0 and 1,000,000.")
                key = (building, resource, timestamp)
                if key in readings and readings[key] != consumption:
                    raise ValueError("Conflicting readings for the same building, resource and hour.")
                readings[key] = consumption
        except (ValueError, OverflowError) as error:
            raise ValueError(f"Row {reader.line_num}: {error}") from error
    if not readings:
        raise ValueError("The CSV does not contain any readings.")
    return readings


def summarize_upload(readings, filename):
    by_pair = defaultdict(dict)
    daily = {resource: defaultdict(float) for resource in RESOURCES}
    for (building, resource, timestamp), value in readings.items():
        by_pair[building, resource][timestamp] = value
        daily[resource][timestamp.date().isoformat()] += value

    def total(values):
        return round(sum(values.values()), 2) if values else None

    names = sorted({building for building, _ in by_pair})
    buildings = []
    for index, name in enumerate(names):
        buildings.append({
            "id": f"uploaded-{index}", "name": name, "color": ("lime", "cyan", "orange", "violet")[index % 4],
            "status": "Imported", **{resource: total(by_pair.get((name, resource))) for resource in RESOURCES},
        })

    expected = sum(int((max(series) - min(series)).total_seconds() // 3600) + 1 for series in by_pair.values())
    days = sorted({day for series in daily.values() for day in series})
    forecasts = dict.fromkeys(RESOURCES)
    for resource in RESOURCES:
        series = [by_pair[building, resource] for building in names if (building, resource) in by_pair]
        if not series:
            continue
        shared_hours = set.intersection(*(set(building) for building in series))
        by_day = defaultdict(dict)
        for timestamp in sorted(shared_hours):
            by_day[timestamp.date()][timestamp.hour] = sum(building[timestamp] for building in series)
        complete = [day for day, hours in by_day.items() if len(hours) == 24]
        if len(complete) < 4:
            continue
        points = [median(by_day[day][hour] for day in complete[:-1]) for hour in range(24)]
        forecasts[resource] = {
            "total": round(sum(points), 2), "unit": "kWh" if resource == "energy" else "kL",
            "date": (complete[-1] + timedelta(days=1)).isoformat(), "points": points,
            "peak": f"{max(range(24), key=points.__getitem__):02d}:00",
        }

    return {
        "account": {"mode": "Uploaded CSV", "campus": filename},
        "period": {"start": days[0], "end": days[-1]},
        "kpis": {**{resource: total(daily[resource]) for resource in RESOURCES},
                 "coverage": round(len(readings) / expected * 100, 1), "alerts": 0,
                 "buildings": len(names), "missing": expected - len(readings)},
        "buildings": buildings, "alerts": [], "actions": [], "forecast": forecasts,
        "chart": {resource: [{"timestamp": day, "value": round(value, 2)} for day, value in sorted(daily[resource].items())]
                  for resource in RESOURCES},
    }
