# Verdyn · AI Campus Digital Twin

A sustainability dashboard for exploring campus resource use, spotting unusual consumption, and forecasting the next 24 hours.

[View dashboard](https://ai-sustainable-campus-twin.gshivanshu007.chatgpt.site) · [Dataset details](data/README.md)

*The hosted dashboard requires authorized access.*

## Features

- Energy, water, transport, waste, and carbon overview.
- Hourly forecasts and unusual-consumption alerts.
- CSV upload with validation and persistent storage.
- Building selector and dated energy/water comparisons.
- Sustainability action planning and demo efficiency scenarios.
- Responsive desktop and mobile navigation.

## Built with

React · TypeScript · Tailwind CSS · Vinext/Vite · Cloudflare Workers · D1 · Drizzle

## Run locally

Requires Node.js **22.13+** and npm.

```sh
git clone https://github.com/sgshiv001/Verdyn-AI-Campus-Digital-Twin.git
cd Verdyn-AI-Campus-Digital-Twin
npm run install:ci
npm run build
```

Complete the one-time [database setup](docs/SETUP.md#database-setup), then start:

```sh
npm run dev
```

Open the local URL printed by the server. See the [setup guide](docs/SETUP.md) for testing and build commands.

## Data & current scope

Energy uses **504 historical hourly estimates** from the COMBED dataset at IIIT-Delhi. Water supports custom CSV imports; its default readings and the transport, waste, carbon, score, and savings indicators are **demo data**.

Forecasting uses a statistical median baseline, not a trained deep-learning model. Live sensors and automatic equipment optimization are not yet implemented.

Source attribution and sample validation are documented in [data/README.md](data/README.md).
