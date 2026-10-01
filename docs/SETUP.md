# Local setup

Requires Node.js 22.13+ and npm. From the repository root:

```sh
npm run install:ci
npm run build
```

The build generates `dist/server/wrangler.json` with the local `DB` binding.

## Database setup

For a **fresh local database only**, apply these migrations in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_outstanding_maggott.sql

node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_nervous_agent_brand.sql

node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_multi_building_datasets.sql
```

These commands use local D1 emulation, not a production database. Do not replay migrations already applied to an existing database. Local records persist in `.wrangler/state`.

## Development

```sh
npm run dev
```

Open the URL printed by the server, normally `http://localhost:5173/`. The first successful dashboard request loads the bundled energy sample and seeds demo records. Stop with **Ctrl+C**.

## Tests

```sh
node --experimental-strip-types --test tests/campus-analytics.test.mjs tests/campus-csv.test.mjs tests/campus-buildings.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

## Production build preview

```sh
npm run build
npm start
```

This previews the built Worker locally; it does not deploy the app. Pushing to GitHub does not automatically update the hosted dashboard.

## Common issues

- **Data service unavailable:** check the `DB` binding and apply pending migrations.
- **Table already exists:** that migration is already applied; do not repeat it.
- **Forecast unavailable:** provide sufficient history, ideally four complete days.
- **CSV rejected:** use one building/resource per file, hourly IST-aligned timestamps, and energy/kWh or water/kL units.
- **Port busy:** stop the existing server or use `npm run dev -- --port 5174`.
- **Hosted dashboard inaccessible:** hosted access is restricted separately from GitHub visibility.

Keep credentials, private campus records, and `.env` files out of version control. See [dataset documentation](../data/README.md) for CSV and sample details.
