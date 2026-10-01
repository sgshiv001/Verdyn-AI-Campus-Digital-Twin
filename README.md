# Verdyn · AI Campus Digital Twin

A campus dashboard generated from **your uploaded CSV files**. No sample data or demo results.

[Open app](https://ai-sustainable-campus-twin.gshivanshu007.chatgpt.site) · [CSV format](data/README.md)

*Hosted access is restricted to authorized users.*

## Features

- Upload, preview, validate, and save hourly energy or water readings.
- Consumption totals, daily charts, and building comparisons.
- Next-day forecasts and unusual-usage checks with enough history.
- Review actions based on your flagged readings.
- Responsive desktop and mobile interface.

## Run locally

Requires Node.js **22.13+** and npm.

```sh
npm run install:ci
npm run build
```

Complete the one-time [database setup](docs/SETUP.md#database-setup), then run `npm run dev`. See the [setup guide](docs/SETUP.md) for tests.

## Scope & stack

Forecasting uses a statistical median baseline, not a trained deep-learning model. Four complete days enable forecasts; smaller files still generate summaries. No live sensors, automatic equipment control, or inferred carbon/sustainability scores.

React · TypeScript · Tailwind CSS · Vinext/Vite · Cloudflare Workers · D1 · Drizzle
