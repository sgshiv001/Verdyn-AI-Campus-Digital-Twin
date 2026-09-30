import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseCampusCsv } from "../lib/campus-csv.ts";
import { analyzeResource, backtestResource } from "../lib/campus-analytics.ts";

const csv = readFileSync(new URL("../public/data/india-campus-energy.csv", import.meta.url), "utf8");
const bundle = JSON.parse(readFileSync(new URL("../data/india-campus-energy.json", import.meta.url), "utf8"));
const header = "recorded_at,building,resource,value,unit\n";
const row = "2014-06-03T00:00:00+05:30,Block A,energy,10,kWh\n";

test("Indian CSV provenance matches the downloadable and server sample", () => {
  assert.equal(csv, bundle.csv);
  assert.equal(createHash("sha256").update(csv).digest("hex"), bundle.metadata.sampleCsvSha256);
  const result = parseCampusCsv(csv, "COMBED");
  assert.equal(result.rowCount, 504);
  assert.equal(result.completeDays, 21);
  assert.equal(result.missingHours, 24);
  assert.equal(result.readings[0].value, 33.7659);
  assert.equal(result.start, "2014-06-02T18:30:00.000Z");
});

test("historical forecasts retain original dates and Indian day boundaries", () => {
  const readings = parseCampusCsv(csv, "COMBED").readings;
  const result = analyzeResource(readings, "Asia/Kolkata");
  assert.equal(result.forecast.analysisDay, "2014-06-24");
  assert.equal(result.forecast.points[0].recordedAt, "2014-06-24T18:30:00.000Z");
  assert.equal(result.forecast.points.length, 24);
  assert.equal(result.forecast.historicalDays, 20);
  assert.equal(result.forecast.total, 685.6);
  assert.ok(result.forecast.points.every((p) => p.lower >= 0 && p.lower <= p.value && p.value <= p.upper));
});

test("walk-forward forecast evaluation on 168 unseen Indian hours", () => {
  const result = backtestResource(parseCampusCsv(csv).readings);
  assert.equal(result.testHours, 168);
  assert.equal(result.testDays, 7);
  assert.equal(result.startDay, "2014-06-18");
  assert.equal(result.mae, 5.6);
  assert.equal(result.wapePercent, 18.7);
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
  for (const bad of [row.replace(",10,", ",-1,"), row.replace(",10,", ",,"), row.replace("kWh", "W"), row.replace("+05:30", ""), row.replace("2014-06-03", "2014-02-30"), row.replace("00:00:00", "00:15:00")]) assert.throws(() => parseCampusCsv(header + bad));
  assert.throws(() => parseCampusCsv("date,value\n2014-06-03,10"), /headers/);
  assert.throws(() => parseCampusCsv("x".repeat(512_001)), /smaller/);
});

test("insufficient history is a warning and never produces a forecast", () => {
  const preview = parseCampusCsv(header + row);
  assert.ok(preview.warnings.some((w) => w.includes("four complete days")));
  assert.equal(analyzeResource(preview.readings, "Asia/Kolkata").forecast, null);
});
