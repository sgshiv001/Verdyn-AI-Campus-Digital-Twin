# Verdyn: AI Campus Digital Twin

An AI-assisted sustainability dashboard and digital-twin prototype for understanding campus energy, water, mobility, waste diversion, and carbon indicators.

Verdyn connects campus readings to an interactive digital campus view, identifies unusual consumption, forecasts the next 24 hours, and presents sustainability actions. The current implementation uses transparent statistical analytics rather than an LLM or a trained deep-learning model.

[Repository](https://github.com/sgshiv001/Verdyn-AI-Campus-Digital-Twin) · [Hosted dashboard](https://ai-sustainable-campus-twin.gshivanshu007.chatgpt.site) · [Indian dataset documentation](data/README.md)

> The hosted dashboard currently requires authorized access. A public source repository does not make the deployed application public.

## Project objective

Develop an AI-powered digital representation of a campus that can monitor, predict, and eventually optimize resource consumption while helping campus teams make evidence-based sustainability decisions.

The intended pipeline is:

```text
Campus data → Validation and storage → Analytics → Digital campus dashboard
                                                     ↓
                              Forecasts → Review and sustainability actions
```

The longer-term vision includes measured energy, water, waste, transportation, and carbon emissions. This repository is a working prototype, not a live sensor-integrated or three-dimensional campus simulator.

## Features and current implementation

| Area | What works today |
| --- | --- |
| Pulse | Campus overview, resource metrics, source labels, alerts, and an illustrative sustainability score |
| Estate | Connected building, active energy dataset, coverage, provenance, and forecast evaluation |
| Energy | Historical Indian campus readings, hourly chart, next-day forecast, peak estimate, and anomaly detection |
| Water | Forecasting and anomaly detection on simulated readings; custom hourly water CSV imports are supported |
| Movement | Demonstration shuttle, bicycle, clean-trip, and avoided-carbon indicators |
| Circularity | Demonstration waste-diversion indicator with an explicit no-real-waste-data notice |
| Navigation | Desktop and mobile section links, active selection, keyboard access, hash links, and browser Back/Forward |
| Data import | CSV preview, validation, duplicate handling, missing-hour warnings, and persistent activation |
| Action planning | Recommendations can be marked planned and saved |
| Scenario | A persistent illustrative efficiency scenario; not a verified optimization of imported readings |

### Real data versus demo data

The distinction is intentional and visible in the interface:

- **Historical measured source:** default energy data comes from the IIIT-Delhi Academic Block in the COMBED dataset. Hourly energy is estimated from measured power.
- **User-provided data:** hourly energy or water CSVs can replace the active dataset for that resource. Uploaded source attribution is unverified unless the upload is the exact bundled COMBED sample.
- **Demo indicators:** water is simulated until a water CSV is imported. Mobility, carbon, waste diversion, the sustainability score, recommendations, and scenario savings remain illustrative.

The application does not connect to live campus meters, automatically control equipment, calculate an audited carbon inventory, or demonstrate real-world savings.

## Technology stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4 |
| UI components | Existing Shadcn/Radix primitives and Lucide icons |
| Application framework | Vinext with Vite and a Next.js-compatible App Router structure |
| Server | Cloudflare Workers-compatible ESM build |
| Persistence | Cloudflare D1 / SQLite; Drizzle schema and SQL migrations |
| Analytics | Same-hour median baseline and median absolute deviation |
| Tests | Node.js built-in test runner |
| Hosting | Existing OpenAI Sites deployment |

The versions installed by this project are pinned through `package-lock.json`. No paid AI API key is required for the existing analytics.

## Getting started locally

### Requirements

- Node.js **22.13.0 or newer**, with npm.
- Git.
- Windows, macOS, or Linux.
- Internet access for the initial dependency install.

Cloudflare account credentials are not needed for local D1 emulation. The local execution profile defaults to portable on a clean clone.

### 1. Clone and install

```sh
git clone https://github.com/sgshiv001/Verdyn-AI-Campus-Digital-Twin.git
cd Verdyn-AI-Campus-Digital-Twin
npm run install:ci
```

The install helper uses the committed lockfile and includes development and optional dependencies. Run only one installer at a time.

### 2. Build the local Worker configuration

```sh
npm run build
```

This generates the client/server build and `dist/server/wrangler.json`, which declares the local `DB` binding.

### 3. Initialize a fresh local database

For a **new local database only**, apply both checked-in migrations in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_outstanding_maggott.sql

node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_nervous_agent_brand.sql
```

These commands affect only the local database. Do not replay an already-applied migration: the SQL creates tables and indexes and is not an idempotent reset. Existing checkouts should apply only pending migrations.

### 4. Start development

```sh
npm run dev
```

Open the exact local URL printed by the server; the portable profile normally starts at `http://localhost:5173/`.

The first successful overview request seeds demonstration records and activates the bundled Indian energy sample. CSV imports, action-plan status, and scenario status persist in the local D1 database under `.wrangler/state`.

Stop the server with **Ctrl+C**.

### Preview a production build

```sh
npm run build
npm start
```

`npm start` previews the built Worker on loopback and uses the same local D1 state. It does not deploy the application. Use the URL printed by that command.

If a host's npm command shim is broken but dependencies are already installed, the application runner can be called directly:

```sh
node scripts/run-framework.mjs dev
node scripts/run-framework.mjs build
```

## Using the dashboard

1. Open **Pulse** for the overview and check each metric's source label.
2. Open **Estate** to review the connected building and dataset coverage.
3. Open **Energy** or **Water** to inspect forecasts and expected peaks.
4. Use **See anomaly details** to compare observed readings with historical patterns.
5. Choose **Data import / Import CSV**, select a file, and review its preview and warnings before saving.
6. Mark relevant demonstration recommendations as planned, or try the demonstration efficiency scenario.

Navigation items scroll to sections of the same dashboard; they are not separate application pages. Refreshing a section URL restores its selection.

## CSV import specification

Required columns:

```csv
recorded_at,building,resource,value,unit
2026-09-01T00:00:00+05:30,Academic Block,energy,12.4,kWh
2026-09-01T01:00:00+05:30,Academic Block,energy,11.8,kWh
```

This two-row example shows the format only; it is insufficient for forecasting.

| Field | Requirement |
| --- | --- |
| `recorded_at` | ISO timestamp with an explicit timezone, aligned to the hour in India Standard Time |
| `building` | Non-empty building name, at most 100 characters; one building per file |
| `resource` | `energy` or `water`; one resource per file |
| `value` | Non-negative hourly consumption, not a cumulative meter total; maximum 1,000,000 |
| `unit` | `kWh` for energy or `kL` for water |

Import behavior:

- Maximum **512,000 bytes**, **3,000 data rows**, and a span of at most **366 days**.
- UTF-8 BOM, CRLF, quoted fields, and escaped quotes are supported.
- Identical duplicate hours are skipped; conflicting values for the same hour are rejected.
- Invalid dates, missing values, mixed resources/buildings, and mismatched units are rejected.
- Missing hours are reported and are not interpolated.
- At least four complete days are recommended and requested by the importer for forecasting.
- Rows are staged and counted before an atomic activation switches the active dataset.
- A failed partial upload does not replace the previously active dataset.
- Earlier imports are retained, and repeated identical reading sets use a deterministic import ID.
- Only **one active building/dataset per resource** is supported currently.

Download the bundled example from [public/data/india-campus-energy.csv](public/data/india-campus-energy.csv).

## Indian energy dataset

**Source:** COMBED, IIIT-Delhi Academic Block, Building Total Mains.

The bundled file contains **504 hourly kWh estimates across 21 complete local days**, between **3 June and 24 June 2014**. It is historical test data, not current campus consumption.

The original power measurements are timestamp-weighted into hourly energy. Retained hours require at least 118 of the nominal 120 samples, no internal gap over 60 seconds, and boundary gaps no larger than 60 seconds. Only fully qualifying days are retained. June 5 is excluded, leaving 24 missing hours; no artificial consumption spikes are inserted.

See [data/README.md](data/README.md) for provenance, formulas, hashes, and attribution. [data/india-campus-energy.json](data/india-campus-energy.json) carries the server sample and metadata; the public CSV provides the downloadable copy.

To regenerate the derived sample from the upstream archive:

```sh
node scripts/prepare-india-sample.mjs
```

This command uses the network and rewrites the bundled sample files. Regeneration is optional; normal operation uses the checked-in sample.

## Forecasting and anomaly detection

### Forecast baseline

For each hour, Verdyn calculates the median consumption at that same hour on prior days. It uses the latest complete day as the analysis day and forecasts the following 24 hours.

Each hourly baseline needs at least three earlier same-hour observations. Forecasts are withheld when the available history is insufficient. Indian and uploaded readings use `Asia/Kolkata`; the simulated series uses UTC.

The displayed forecast range is a heuristic spread based on the larger of 15% of the median or twice the robust standard-deviation estimate. It is **not a statistically calibrated confidence interval**.

### Anomaly detection

The detector compares readings on the analysis day against the same-hour historical median. Its threshold combines a relative increase, median absolute deviation, and a resource-specific minimum difference.

It flags unusually **high** consumption and explains the observed value, baseline, percentage difference, building, timestamp, and source. The displayed pattern score is a heuristic ranking, not the probability that a leak or fault exists.

### Historical evaluation

Chronological walk-forward evaluation holds out the last seven retained days. Each test day is predicted using only earlier readings.

| Metric | Bundled historical sample |
| --- | --- |
| Evaluated days | 7 |
| Evaluated hours | 168 |
| Weighted absolute percentage error (WAPE) | 18.7% |
| Mean absolute hourly error (MAE) | 5.60 kWh |

WAPE is total absolute error divided by total observed consumption. The dashboard's latest-day median error is a separate metric and should not be confused with the held-out WAPE.

These results describe this sample and baseline only. They do not guarantee future performance or transfer to another building.

## Architecture and project structure

```text
Browser dashboard
  ├─ GET overview / analytics
  ├─ POST CSV preview / import
  └─ POST plan / demo scenario
             ↓
    App Router API handlers
             ↓
    Validation + campus data services
             ↓
       Cloudflare D1 storage
             ↓
    Forecasts + anomaly analysis
             ↓
    Source-labelled dashboard results
```

```text
app/
  page.tsx                       Dashboard and section navigation
  globals.css                    Verdant-themed responsive styling
  api/campus/                    Overview, analytics, imports, plans, scenarios
components/
  campus-csv-import.tsx           CSV selection, preview, and import
  ui/                            Shared interface primitives
lib/
  campus-csv.ts                   CSV parsing and validation
  campus-imports.ts               Persistent imports and atomic activation
  campus-analytics.ts             Forecasting, anomalies, and backtesting
  campus-data.ts                  Dashboard data and demo seeding
db/
  schema.ts                      Drizzle table definitions
  index.ts                       D1 access helpers
drizzle/                         SQL migrations and schema snapshots
data/                            Derived Indian sample and provenance
public/data/                     Downloadable CSV sample
scripts/                         Install, execution, and sample preparation
tests/                           Analytics and CSV regression tests
.openai/hosting.json              Existing Sites project and logical DB binding
```

### Database tables

- `campus_imports`: dataset metadata, coverage, staging state, and active flags.
- `campus_import_readings`: hourly values belonging to an import.
- `campus_readings`: seeded demonstration readings.
- `campus_metrics`: illustrative dashboard indicators.
- `campus_alerts`: seeded alert records.
- `campus_recommendations`: demonstration actions and their persisted status.

Data is application-wide within a deployment, not partitioned into separate user-owned campuses.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/campus/overview` | Dashboard metrics, series, actions, alerts, and analytics |
| GET | `/api/campus/analytics` | Forecasts, anomalies, active datasets, and evaluations |
| POST | `/api/campus/import` | Validate/preview a CSV or persist and activate it |
| POST | `/api/campus/scenario` | Activate the illustrative efficiency scenario |
| POST | `/api/campus/recommendations/{id}/plan` | Persist a recommendation as planned |

The import endpoint accepts `application/json`:

```json
{
  "action": "preview",
  "name": "Academic Block energy",
  "csv": "recorded_at,building,resource,value,unit\n2026-09-01T00:00:00+05:30,Academic Block,energy,12.4,kWh"
}
```

Use `"action": "import"` to save after validation. Validation failures return 422, unsupported content types 415, oversized requests 413, and persistence failures 503. A successful saved import returns 201.

The browser also registers optional WebMCP snapshot and scenario tools when the browser supports that API; these are distinct from a separately hosted MCP server.

## Testing and verification

Run the analytics and CSV regression suite:

```sh
node --experimental-strip-types --test tests/campus-analytics.test.mjs tests/campus-csv.test.mjs
```

Run a TypeScript check without updating the tracked incremental cache:

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Build:

```sh
npm run build
```

The suite currently contains **11 tests**, covering forecasts, insufficient history, anomalies, Indian sample consistency, timezone boundaries, chronological evaluation, duplicates, quoting, and invalid CSV input.

Desktop/mobile section navigation, keyboard activation, hash refresh, and Back/Forward have also been manually checked. These browser checks are not an automated end-to-end suite.

## Deployment, configuration, and security

- This project is already associated with a Sites deployment through `.openai/hosting.json`.
- Its logical D1 binding is `DB`; production resources are supplied by the hosting platform.
- A build outputs `dist/client` and `dist/server`. The server is a Cloudflare Worker, not a plain static export.
- Pushing this repository does **not** automatically update the hosted dashboard. No GitHub Actions deployment workflow is configured.
- To publish through Sites, use the existing Sites project and its hosting workflow. Do not create a replacement Site or change the project ID simply to push source to GitHub.
- To deploy independently on Cloudflare, provision a real D1 database, configure production bindings and access controls, and apply migrations. The local placeholder database ID is not a production database.
- Local portable development can simulate ChatGPT sign-in on loopback; production sign-in and the current access policy are owned by the hosting platform.
- The application currently relies on deployment-level access control. It does not implement role-based permissions or per-user isolation for write actions.
- Keep sensitive campus data behind appropriate access controls. Review authentication, authorization, rate limits, audit logging, and data retention before exposing production imports publicly.

Git ignores dependency folders, generated builds, local D1 state, tool state, temporary outputs, and `.env*` files. Never commit tokens, credentials, real student information, or sensitive campus records.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Dashboard shows sample values or a data-service error | Verify the `DB` binding and apply pending local migrations |
| Table already exists while applying SQL | The migration was already applied; do not replay it |
| Forecast unavailable | Supply sufficient earlier same-hour history and complete local days |
| CSV rejected | Check required headers, explicit timestamps, units, and the one-building/resource rule |
| Port already in use | Stop the existing development server or run `npm run dev -- --port 5174` |
| Hosted URL is inaccessible | The deployed dashboard requires authorized access; GitHub visibility is separate |
| Import is saved but the UI does not refresh | Reload the dashboard; the response will explain a refresh failure |

## Roadmap — not yet implemented

- Live meter/IoT ingestion and multi-building campus views.
- Measured water, waste, transportation, and carbon inventories.
- Weather, occupancy, and calendar features for forecasting.
- Comparison against trained ML models with broader chronological validation.
- Real optimization with operational constraints and verified savings.
- Calibrated uncertainty, monitoring, and drift detection.
- User roles, audit trails, deployment-specific permissions, and automated end-to-end tests.

## Attribution and licensing

COMBED was released by Nipun Batra, Oliver Parson, Mario Berges, Amarjeet Singh, Alex Rogers, and collaborators. See [the COMBED project](https://combed.github.io/) and [the associated paper](https://arxiv.org/abs/1408.6595).

This repository does not currently declare a root software license. Dependency and vendored-asset licenses still apply; the bundled Sites Vite plugin includes its own license notice. Review upstream dataset terms before redistributing or using the dataset beyond this prototype. Attribution alone is not a license grant.
