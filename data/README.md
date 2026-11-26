# Verdyn data

`demo/` contains the supplied simulated archive used by default in the live demo. It is labeled `SIMULATED_DEMO_NOT_MEASURED` and must not be presented as live campus data.

`uploads/` is created automatically when a CSV is imported through `/imports`. Uploaded files are local runtime data and are ignored by Git.

## Accepted upload columns

Verdyn accepts one CSV with a timestamp, building, and at least one resource column:

- Timestamp: `timestamp_local`, `timestamp`, `recorded_at`, or `datetime`
- Building: `building_name`, `building`, `building_id`, or `site`
- Energy: `electricity_kwh`, `energy_kwh`, `energy`, or `kwh`
- Water: `water_liters`, `water_kl`, `water`, or `kl`

Water values are interpreted as liters when the column contains `liter`; otherwise they are treated as kL.
