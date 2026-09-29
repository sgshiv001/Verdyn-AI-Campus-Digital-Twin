import { getD1 } from "@/db";

const stamp = "2026-09-29T00:00:00.000Z";
const energy = [42, 49, 47, 55, 51, 68, 63, 73, 67, 78, 75, 88];
const water = [34, 39, 37, 46, 42, 53, 48, 57, 54, 62, 58, 66];

type D1Row = Record<string, unknown>;

function rows(result: D1Result<D1Row>) {
  return result.results ?? [];
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

export async function getCampusOverview() {
  const db = getD1();
  await seedCampusData();
  const [metricResult, energyResult, waterResult, alertResult, recommendationResult] = await db.batch([
    db.prepare("SELECT id, label, value, unit, change_text, trend, accent FROM campus_metrics ORDER BY id"),
    db.prepare("SELECT value FROM campus_readings WHERE resource = ? ORDER BY recorded_at").bind("energy"),
    db.prepare("SELECT value FROM campus_readings WHERE resource = ? ORDER BY recorded_at").bind("water"),
    db.prepare("SELECT id, title, detail, building, severity, status FROM campus_alerts WHERE status = ? ORDER BY created_at DESC").bind("open"),
    db.prepare("SELECT id, title, detail, impact, tag, tone, category, status FROM campus_recommendations ORDER BY id"),
  ]);
  const recommendations = rows(recommendationResult);
  const isOptimized = recommendations.some((item) => item.id === "hvac" && item.status === "active");

  return {
    score: isOptimized ? 87 : 82,
    optimized: isOptimized,
    metrics: rows(metricResult),
    series: {
      energy: rows(energyResult).map((item) => Number(item.value)),
      water: rows(waterResult).map((item) => Number(item.value)),
    },
    alerts: rows(alertResult),
    recommendations,
    mobility: { cleanTrips: 68, shuttleTrips: 1286, bikeRides: 438, avoidedCarbon: 2.1 },
    updatedAt: new Date().toISOString(),
  };
}

export async function activateEfficiencyScenario() {
  const db = getD1();
  await seedCampusData();
  await db.prepare("UPDATE campus_recommendations SET status = ?, updated_at = ? WHERE id = ?")
    .bind("active", new Date().toISOString(), "hvac").run();
  return getCampusOverview();
}

export async function planRecommendation(id: string) {
  const db = getD1();
  await seedCampusData();
  const result = await db.prepare("UPDATE campus_recommendations SET status = ?, updated_at = ? WHERE id = ? AND status != ?")
    .bind("planned", new Date().toISOString(), id, "planned").run();
  if (!result.meta.changes) return null;
  return { id, status: "planned" };
}
