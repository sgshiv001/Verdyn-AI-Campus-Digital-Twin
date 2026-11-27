# Your campus CSV

The app starts empty. Upload your own file using these exact headers:

```csv
recorded_at,building,resource,value,unit
```

- You can include multiple buildings and resources in one file. Verdyn prepares a dataset for each building and resource.
- Energy: `resource=energy`, `unit=kWh`; water: `resource=water`, `unit=kL`.
- Values are non-negative **hourly consumption**, not cumulative meter readings or instantaneous power.
- Timestamps need an explicit timezone and must align to the hour in IST. Use `YYYY-MM-DDTHH:00:00+05:30`.
- Files can be up to 10 MB. Each building and resource can have up to 3,000 readings and 500 KB of normalized data.

Verdyn also accepts monthly archives with `timestamp_local`, `building_id`, `electricity_kwh`, and `water_liters`. It reads local timestamps as IST, converts liters to kL, skips readings flagged as missing, and identifies datasets labeled as simulated.

Select one or more CSV files and review each preview before importing. Validation and save errors appear beside the affected file. Successfully saved files are kept when another file fails, and failed saves can be retried. Identical duplicate rows are skipped; conflicting duplicates are rejected. Missing hours are reported, never filled.

Each building/resource keeps its own active dataset. A new upload replaces only that pair; other buildings and earlier imports remain saved.

When selected files share a building/resource, the last successfully saved file in the displayed list becomes active.

Totals use your uploaded rows; daily charts and comparisons use complete IST days. Four complete days enable median-baseline forecasts and unusual-usage checks. Predictions follow the latest complete day in the file, not today's date. Forecast validation uses earlier readings only and does not guarantee future accuracy.

Upload source claims are unverified. No demo data, carbon figures, sustainability scores, or estimated savings are generated.
