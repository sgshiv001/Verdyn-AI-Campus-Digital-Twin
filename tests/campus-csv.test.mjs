import assert from "node:assert/strict";
import test from "node:test";
import { parseCampusCsv } from "../lib/campus-csv.ts";
import { analyzeResource, backtestResource } from "../lib/campus-analytics.ts";

// Fixtures are generated in memory, never shipped as sample files or app data.
const header = "recorded_at,building,resource,value,unit\n";
const row = "2024-01-01T00:00:00+05:30,Block A,energy,10,kWh\n";
const csv = header + Array.from({length: 96}, (_, i) =>
  `2024-01-${String(1 + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00+05:30,Block A,energy,10,kWh`).join("\n");

test("user CSV parsing preserves values and reports its own coverage", () => {
  const result = parseCampusCsv(csv, "User upload");
  assert.equal(result.rowCount, 96);
  assert.equal(result.completeDays, 4);
  assert.equal(result.missingHours, 0);
  assert.equal(result.readings[0].value, 10);
  assert.equal(result.start, "2023-12-31T18:30:00.000Z");
  assert.throws(() => parseCampusCsv(header), /rows|reading/i);
});

test("uploaded forecasts retain file dates and Indian day boundaries", () => {
  const result = analyzeResource(parseCampusCsv(csv).readings, "Asia/Kolkata");
  assert.equal(result.forecast.analysisDay, "2024-01-04");
  assert.equal(result.forecast.points[0].recordedAt, "2024-01-04T18:30:00.000Z");
  assert.equal(result.forecast.points.length, 24);
  assert.equal(result.forecast.historicalDays, 3);
  assert.equal(result.forecast.total, 240);
  assert.ok(result.forecast.points.every((p) => p.lower >= 0 && p.lower <= p.value && p.value <= p.upper));
});

test("forecast validation measures only uploaded held-out hours", () => {
  const result = backtestResource(parseCampusCsv(csv).readings, "Asia/Kolkata");
  assert.equal(result.testHours, 24);
  assert.equal(result.testDays, 1);
  assert.equal(result.startDay, "2024-01-04");
  assert.equal(result.mae, 0);
  assert.equal(result.wapePercent, 0);
});

test("chronological evaluation excludes the day being predicted", () => {
  const readings = [];
  for (let day = 1; day <= 5; day++) for (let hour = 0; hour < 24; hour++) readings.push({resource:"energy_hourly_kwh", building:"A", source:"CSV", unit:"kWh", value: day === 5 ? 100 : 10, recordedAt:new Date(`2024-01-0${day}T${String(hour).padStart(2,"0")}:00:00+05:30`).toISOString()});
  const result = backtestResource(readings, "Asia/Kolkata", 1);
  assert.equal(result.mae, 90);
  assert.equal(result.wapePercent, 90);
});

test("identical duplicates are skipped, conflicting duplicates rejected", () => {
  assert.equal(parseCampusCsv(header + row + row).duplicateCount, 1);
  assert.throws(() => parseCampusCsv(header + row + row.replace(",10,", ",11,")), /conflicting/);
  assert.throws(() => parseCampusCsv(header + row + row.replace("Block A", "Block B")), /one building/);
});

test("quoted building names, BOM and CRLF are accepted", () => {
  const result = parseCampusCsv("\uFEFF" + (header + row.replace("Block A", '"Block A, East"')).replaceAll("\n", "\r\n"));
  assert.equal(result.building, "Block A, East");
});

test("bad values, units, dates and implicit timezones are rejected", () => {
  for (const bad of [row.replace(",10,", ",-1,"), row.replace(",10,", ",,"), row.replace("kWh", "W"), row.replace("+05:30", ""), row.replace("2024-01-01", "2024-02-30"), row.replace("00:00:00", "00:15:00")]) assert.throws(() => parseCampusCsv(header + bad));
  assert.throws(() => parseCampusCsv("date,value\n2024-01-01,10"), /headers/);
  assert.throws(() => parseCampusCsv("x".repeat(512_001)), /smaller/);
});

test("insufficient history is a warning and never produces a forecast", () => {
  const preview = parseCampusCsv(header + row);
  assert.ok(preview.warnings.some((w) => w.includes("four complete days")));
  assert.equal(analyzeResource(preview.readings, "Asia/Kolkata").forecast, null);
});
