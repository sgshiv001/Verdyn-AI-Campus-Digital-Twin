import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { saveBuildingImport, loadBuildingImports, restoreLegacyBuildingImports } from "../lib/campus-import-store.ts";
import { buildingAnalytics, comparisonForDay, BuildingNotFoundError } from "../lib/campus-buildings.ts";

// Exercise the production prepared SQL against SQLite, with D1-style bindings.
class LocalD1 {
  db = new DatabaseSync(":memory:");
  failActivation = false;
  constructor() {
    for (const file of ["0000_outstanding_maggott.sql", "0001_nervous_agent_brand.sql", "0002_multi_building_datasets.sql"]) {
      this.db.exec(readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"));
    }
  }
  prepare(sql) {
    const statement = this.db.prepare(sql);
    const wrap = (args = []) => ({ sql,
      bind: (...values) => wrap(values),
      first: async () => statement.get(...args) ?? null,
      all: async () => ({results: statement.all(...args), success: true}),
      run: async () => ({success: true, meta: {changes: Number(statement.run(...args).changes)}}),
    });
    return wrap();
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        if (this.failActivation && statement.sql.startsWith("UPDATE campus_imports SET status")) throw new Error("Test activation failure");
        results.push(await statement.run());
      }
      this.db.exec("COMMIT"); return results;
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  close() { this.db.close(); }
}
const csv = (building, value, resource = "energy", start = 1) => "recorded_at,building,resource,value,unit\n" + Array.from({length: 96}, (_, i) => `2026-09-${String(start + Math.floor(i / 24)).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00+05:30,${building},${resource},${value},${resource === "energy" ? "kWh" : "kL"}`).join("\n");
const save = (db, building, value, resource = "energy", start = 1) => saveBuildingImport(db, csv(building, value, resource, start), building, "test fixture · unverified");

test("different buildings and resources retain independent active datasets", async () => {
  const db = new LocalD1();
  try {
    await save(db, "Academic", 2); await save(db, "Library", 9); await save(db, "Academic", 1, "water");
    const loaded = await loadBuildingImports(db);
    assert.equal(loaded.datasets.length, 3); assert.equal(loaded.readings.length, 288);
    assert.deepEqual(loaded.datasets.map((item) => [item.building, item.resource]), [["Academic", "energy_hourly_kwh"], ["Academic", "water_hourly_kl"], ["Library", "energy_hourly_kwh"]]);
  } finally { db.close(); }
});

test("replacement, repeat import, and legacy restoration never overwrite another pair", async () => {
  const db = new LocalD1();
  try {
    const old = await save(db, "Academic", 2); await save(db, "Library", 9); await save(db, "Academic", 1, "water");
    const next = await save(db, "Academic", 3); await save(db, "Academic", 3); await restoreLegacyBuildingImports(db);
    const loaded = await loadBuildingImports(db);
    assert.equal(loaded.datasets.length, 3); assert(loaded.datasets.some((item) => item.id === next.id)); assert(!loaded.datasets.some((item) => item.id === old.id));
    assert.throws(() => db.db.prepare("UPDATE campus_imports SET active = 1 WHERE id = ?").run(old.id), /UNIQUE/);
  } finally { db.close(); }
});

test("failed activation rolls back and leaves the preceding active import available", async () => {
  const db = new LocalD1();
  try {
    const old = await save(db, "Academic", 2); await save(db, "Library", 9);
    db.failActivation = true; await assert.rejects(save(db, "Academic", 3), /activation failure/);
    assert.equal((await loadBuildingImports(db)).datasets.find((item) => item.building === "Academic").id, old.id);
    db.failActivation = false; await save(db, "Academic", 3);
    assert.equal((await loadBuildingImports(db)).datasets.length, 2);
  } finally { db.close(); }
});

test("legacy globally-deactivated buildings are restored without selecting incomplete uploads", async () => {
  const db = new LocalD1();
  try {
    await save(db, "Academic", 2); const latest = await save(db, "Academic", 3);
    db.db.exec("UPDATE campus_imports SET active = 0"); await save(db, "Library", 9);
    db.failActivation = true; await assert.rejects(save(db, "Academic", 4), /activation failure/);
    await restoreLegacyBuildingImports(db); await restoreLegacyBuildingImports(db);
    const loaded = await loadBuildingImports(db);
    assert.equal(loaded.datasets.length, 2); assert.equal(loaded.datasets.find((item) => item.building === "Academic").id, latest.id);
  } finally { db.close(); }
});

test("forecasts, anomalies, and missing resources stay isolated by building", async () => {
  const db = new LocalD1();
  try {
    await save(db, "Academic", 2); await save(db, "Library", 9); await save(db, "Library", 1, "water");
    const loaded = await loadBuildingImports(db);
    const academic = buildingAnalytics(loaded.readings, loaded.datasets, "Academic");
    const library = buildingAnalytics(loaded.readings, loaded.datasets, "Library");
    assert.equal(academic.forecasts.energy.total, 48); assert.equal(library.forecasts.energy.total, 216);
    assert.equal(academic.forecasts.water, null); assert.equal(academic.resources.water, null); assert.equal(academic.latestReadings.water.length, 0);
    assert.equal(library.forecasts.water.total, 24); assert(academic.anomalies.every((item) => item.building === "Academic"));
    assert.throws(() => buildingAnalytics(loaded.readings, loaded.datasets, "Missing"), BuildingNotFoundError);
  } finally { db.close(); }
});

test("comparisons align only on common complete IST days and retain zero consumption", () => {
  const entries = [{building: "Academic", source: "CSV", days: [{day: "2026-09-01", total: 0}, {day: "2026-09-02", total: 20}]}, {building: "Library", source: "CSV", days: [{day: "2026-09-01", total: 10}]}];
  const result = comparisonForDay(entries, "2026-09-02");
  assert.equal(result.day, "2026-09-01"); assert.equal(result.rows[0].reading.total, 0); assert.equal(result.aligned, true);
  const unmatched = comparisonForDay([entries[0], {building: "Lab", source: "CSV", days: [{day: "2026-08-01", total: 5}]}]);
  assert.equal(unmatched.day, null); assert.equal(unmatched.aligned, false); assert.equal(unmatched.rows[0].reading.day, "2026-09-02");
});
