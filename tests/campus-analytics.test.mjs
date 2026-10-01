import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCampus } from "../lib/campus-analytics.ts";

function history({ energySpike = true, waterSpike = true } = {}) {
  const readings = [];
  for (let day = 1; day <= 8; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const recordedAt = new Date(`2026-09-${String(day + 10).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+05:30`).toISOString();
      readings.push({
        resource: "energy_hourly_kwh",
        building: "Main Campus",
        recordedAt,
        value: 500 + hour * 10 + (day === 8 && hour === 14 && energySpike ? 400 : 0),
        unit: "kWh",
        source: "test fixture · unverified",
      });
      readings.push({
        resource: "water_hourly_kl",
        building: "Science Block",
        recordedAt,
        value: 1 + hour * 0.1 + (day === 8 && hour === 2 && waterSpike ? 1.3 : 0),
        unit: "kL",
        source: "test fixture · unverified",
      });
    }
  }
  return readings;
}

test("forecasts the next 24 hours from same-hour history", () => {
  const result = analyzeCampus(history({ energySpike: false, waterSpike: false }));
  assert.equal(result.forecasts.energy?.points.length, 24);
  assert.equal(result.forecasts.water?.points.length, 24);
  assert.equal(result.forecasts.energy?.points[14].value, 640);
  assert.equal(result.forecasts.water?.points[2].value, 1.2);
  assert.equal(result.forecasts.energy?.historicalDays, 7);
  assert.equal(result.anomalies.length, 0);
});

test("flags measured spikes and explains the comparison", () => {
  const result = analyzeCampus(history());
  assert.equal(result.anomalies.length, 2);
  assert.ok(result.anomalies.some((item) => item.resource === "energy_hourly_kwh" && item.observed === 1040));
  assert.ok(result.anomalies.some((item) => item.resource === "water_hourly_kl" && item.reason.includes("1.2 kL typical")));
  assert.ok(result.anomalies.every((item) => item.confidence >= 60 && item.confidence <= 99));
});

test("withholds forecasts when there is too little history", () => {
  const result = analyzeCampus(history().filter((item) => item.recordedAt >= "2026-09-17"));
  assert.equal(result.forecasts.energy, null);
  assert.equal(result.forecasts.water, null);
  assert.equal(result.anomalies.length, 0);
});
