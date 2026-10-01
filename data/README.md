# Your campus CSV

The app starts empty. Upload your own file using these exact headers:

```csv
recorded_at,building,resource,value,unit
```

- One building and one resource per file.
- Energy: `resource=energy`, `unit=kWh`; water: `resource=water`, `unit=kL`.
- Values are non-negative **hourly consumption**, not cumulative meter readings or instantaneous power.
- Timestamps need an explicit timezone and must align to the hour in IST. Use `YYYY-MM-DDTHH:00:00+05:30`.
- Up to 3,000 rows and 500 KB per file. No missing values.

Preview and validate the file before choosing **Use these readings**. Identical duplicates are skipped; conflicting duplicates are rejected. Missing hours are reported, never filled.

Each building/resource keeps its own active dataset. A new upload replaces only that pair; other buildings and earlier imports remain saved.

Totals use your uploaded rows; daily charts and comparisons use complete IST days. Four complete days enable median-baseline forecasts and unusual-usage checks. Predictions follow the latest complete day in the file, not today's date. Forecast validation uses earlier readings only and does not guarantee future accuracy.

Upload source claims are unverified. No demo data, carbon figures, sustainability scores, or estimated savings are generated.
