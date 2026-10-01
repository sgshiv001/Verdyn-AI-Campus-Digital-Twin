import { getD1 } from "@/db";
import type { HourlyReading } from "@/lib/campus-analytics";
import { buildingAnalytics } from "@/lib/campus-buildings";
import { ensureIndiaSample, getActiveImports } from "@/lib/campus-imports";

const stamp = "2026-09-29T00:00:00.000Z";
const energy = [42, 49, 47, 55, 51, 68, 63, 73, 67, 78, 75, 88];
const water = [34, 39, 37, 46, 42, 53, 48, 57, 54, 62, 58, 66];

type D1Row = Record<string, unknown>;

function rows(result: D1Result<unknown>): D1Row[] {
  return (result.results ?? []) as D1Row[];
}

async function seedHistoricalReadings() {
  const db = getD1();
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const latestDay = yesterday.toISOString().slice(0, 10);
  const existing = await db.prepare(
    "SELECT COUNT(*) AS count FROM campus_readings WHERE resource = ? AND recorded_at >= ? AND recorded_at < ?",
  ).bind("energy_hourly_kwh", latestDay + "T00:00:00.000Z", latestDay + "T23:59:59.999Z").first<{ count: number }>();
  if ((existing?.count ?? 0) === 24) return;

  const statements: D1PreparedStatement[] = [];
  for (let dayOffset = 8; dayOffset >= 1; dayOffset--) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - dayOffset);
    for (let hour = 0; hour < 24; hour++) {
      const recordedAt = new Date(date);
      recordedAt.setUTCHours(hour);
      const daytime = Math.max(0, Math.sin(((hour - 6) / 17) * Math.PI));
      const energyBase = 530 + 480 * daytime + 34 * Math.sin((hour / 24) * Math.PI * 4);
      const waterBase = 0.85 + 2.35 * daytime + 0.18 * Math.cos((hour / 24) * Math.PI * 4);
      const dayVariation = 1 + 0.025 * Math.sin(dayOffset * 2.1 + hour * 0.3);
      const latest = dayOffset === 1;
      const energyValue = Number((energyBase * dayVariation * (latest && hour === 14 ? 1.43 : 1)).toFixed(1));
      const waterValue = Number((waterBase * dayVariation * (latest && (hour === 2 || hour === 3) ? 2.2 : 1)).toFixed(2));
      statements.push(db.prepare(
        "INSERT OR IGNORE INTO campus_readings (recorded_at, resource, building, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(recordedAt.toISOString(), "energy_hourly_kwh", "Main Campus", energyValue, "kWh", "simulated"));
      statements.push(db.prepare(
        "INSERT OR IGNORE INTO campus_readings (recorded_at, resource, building, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(recordedAt.toISOString(), "water_hourly_kl", "Science Block", waterValue, "kL", "simulated"));
    }
  }
  for (let start = 0; start < statements.length; start += 60) {
    await db.batch(statements.slice(start, start + 60));
  }
}

export async function getCampusAnalytics(building?: string) {
  const db = getD1();
  await ensureIndiaSample();
  await seedHistoricalReadings();
  const imported = await getActiveImports();
  const earliest = new Date();
  earliest.setUTCHours(0, 0, 0, 0);
  earliest.setUTCDate(earliest.getUTCDate() - 8);
  const result = await db.prepare(
    "SELECT resource, building, recorded_at AS recordedAt, value, unit, source FROM campus_readings WHERE resource IN (?, ?) AND recorded_at >= ? ORDER BY recorded_at",
  ).bind("energy_hourly_kwh", "water_hourly_kl", earliest.toISOString()).all<HourlyReading>();
  const pairs = new Set(imported.datasets.map((dataset) => JSON.stringify([dataset.resource, dataset.building])));
  const readings = [...(result.results ?? []).filter((r) => !pairs.has(JSON.stringify([r.resource, r.building]))), ...imported.readings];
  return buildingAnalytics(readings, imported.datasets, building);
}

export async function seedCampusData() {
  const db = getD1();
  const statements: D1PreparedStatement[] = [];

  for (const [resource, values, building, unit] of [
    ["energy", energy, "Main Campus", "index"],
    ["water", water, "Science Block", "index"],
  ] as const) {
    values.forEach((value, hour) => {
      const recordedAt = "2026-09-29T" + String(hour + 6).padStart(2, "0") + ":00:00.000Z";
      statements.push(
        db.prepare("INSERT OR IGNORE INTO campus_readings (recorded_at, resource, building, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(recordedAt, resource, building, value, unit, "simulated"),
      );
    });
  }

  const metrics = [
    ["energy", "Energy", 18.4, "MWh", "8.2% below plan", "down", "lime"],
    ["water", "Water", 412, "kL", "3.1% above plan", "up", "blue"],
    ["carbon", "Carbon", 6.8, "tCO₂e", "11.4% lower", "down", "pink"],
    ["diversion", "Diversion", 72, "%", "4.6% improved", "down", "orange"],
  ];
  for (const metric of metrics) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO campus_metrics (id, label, value, unit, change_text, trend, accent, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(...metric, stamp),
    );
  }

  const alerts = [
    ["water-flow", "Water flow anomaly", "Night flow is 26% above its expected pattern.", "Science Block", "high", "open", stamp],
    ["peak-demand", "Peak demand approaching", "Admin Block is expected to peak at 14:30.", "Admin Block", "medium", "open", stamp],
  ];
  for (const alert of alerts) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO campus_alerts (id, title, detail, building, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(...alert),
    );
  }

  const recommendations = [
    ["hvac", "Delay Library HVAC start", "Low-occupancy mornings make a 30-minute delay feasible.", "−1.2 MWh", "highest return", "lime", "energy", "new", stamp],
    ["water", "Inspect Science Block line", "Night flow is 26% above its expected pattern.", "−38 kL", "review today", "blue", "water", "new", stamp],
    ["shuttle", "Add one evening shuttle", "Demand clusters after 17:30 on weekdays.", "−0.4 tCO₂e", "next best move", "orange", "mobility", "new", stamp],
  ];
  for (const recommendation of recommendations) {
    statements.push(
      db.prepare("INSERT OR IGNORE INTO campus_recommendations (id, title, detail, impact, tag, tone, category, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(...recommendation),
    );
  }

  await db.batch(statements);
}

export async function getCampusOverview(building?: string) {
  const db = getD1();
  await seedCampusData();
  const analytics = await getCampusAnalytics(building);
  const [metricResult, recommendationResult] = await db.batch([
    db.prepare("SELECT id, label, value, unit, change_text, trend, accent FROM campus_metrics ORDER BY id"),
    db.prepare("SELECT id, title, detail, impact, tag, tone, category, status FROM campus_recommendations ORDER BY id"),
  ]);
  const recommendations = rows(recommendationResult);
  const isOptimized = recommendations.some((item) => item.id === "hvac" && item.status === "active");
  const metrics = rows(metricResult);
  for (const resource of ["energy", "water"] as const) {
    const values = analytics.latestReadings[resource], source = analytics.resources[resource];
    const metric = metrics.find((item) => item.id === resource);
    if (metric) Object.assign(metric, {
      label: `Building ${resource}`, unit: resource === "energy" ? "kWh" : "kL", trend: "neutral",
      value: values.length ? Number(values.reduce((sum, reading) => sum + reading.value, 0).toFixed(2)) : null,
      change_text: !source ? "No readings connected" : !values.length ? "No complete day" : `${analytics.analysisDays[resource]} · ${source === "simulated" ? "Demo" : source.includes("COMBED") ? "historical" : "CSV"}`,
    });
  }
  metrics.filter((item) => item.id !== "energy" && item.id !== "water").forEach((item) => { item.change_text = "Demo · " + item.change_text; });

  return {
    score: isOptimized ? 87 : 82,
    optimized: isOptimized,
    metrics,
    series: {
      energy: analytics.latestReadings.energy.map((r) => r.value),
      water: analytics.latestReadings.water.map((r) => r.value),
    },
    alerts: analytics.anomalies,
    analytics,
    recommendations,
    mobility: { cleanTrips: 68, shuttleTrips: 1286, bikeRides: 438, avoidedCarbon: 2.1 },
    updatedAt: new Date().toISOString(),
  };
}

export async function activateEfficiencyScenario(building?: string) {
  const db = getD1();
  // Validate the building before changing the campus-wide demo scenario.
  await getCampusAnalytics(building);
  await seedCampusData();
  await db.prepare("UPDATE campus_recommendations SET status = ?, updated_at = ? WHERE id = ?")
    .bind("active", new Date().toISOString(), "hvac").run();
  return getCampusOverview(building);
}

export async function planRecommendation(id: string) {
  const db = getD1();
  await seedCampusData();
  const result = await db.prepare("UPDATE campus_recommendations SET status = ?, updated_at = ? WHERE id = ? AND status NOT IN (?, ?)")
    .bind("planned", new Date().toISOString(), id, "planned", "active").run();
  if (!result.meta.changes) return null;
  return { id, status: "planned" };
}
