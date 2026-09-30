import { getD1 } from "@/db";
import { parseCampusCsv, type CsvPreview } from "@/lib/campus-csv";
import type { HourlyReading } from "@/lib/campus-analytics";
import indiaSample from "@/data/india-campus-energy.json";

export type DatasetInfo = {
  id: string; name: string; resource: string; building: string; source: string;
  rowCount: number; missingHours: number; start: string; end: string;
};

export async function saveCampusImport(csv: string, name: string, source = "uploaded CSV · source unverified") {
  if (csv === indiaSample.csv) {
    name = indiaSample.metadata.name;
    source = "COMBED · historical measured power";
  }
  const preview = parseCampusCsv(csv, source);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(preview.readings)));
  const id = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getD1();
  await db.prepare("INSERT OR IGNORE INTO campus_imports (id, name, resource, building, source, row_count, missing_hours, start_at, end_at, status, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, name.slice(0, 100), preview.resource, preview.building, source, preview.rowCount, preview.missingHours, preview.start, preview.end, "staging", 0, new Date().toISOString()).run();
  for (let start = 0; start < preview.readings.length; start += 60) {
    await db.batch(preview.readings.slice(start, start + 60).map((reading) => db.prepare("INSERT OR IGNORE INTO campus_import_readings (import_id, recorded_at, value) VALUES (?, ?, ?)").bind(id, reading.recordedAt, reading.value)));
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM campus_import_readings WHERE import_id = ?").bind(id).first<{count: number}>();
  if (count?.count !== preview.rowCount) throw new Error("The import did not finish. Your previous dataset remains active; please retry.");
  // Activation is atomic. A partial or failed upload never replaces the previous dataset.
  await db.batch([
    db.prepare("UPDATE campus_imports SET active = 0 WHERE resource = ?").bind(preview.resource),
    db.prepare("UPDATE campus_imports SET status = ?, active = 1 WHERE id = ?").bind("ready", id),
  ]);
  return { id, ...preview };
}

export async function ensureIndiaSample() {
  const existing = await getD1().prepare("SELECT id FROM campus_imports WHERE resource = ? AND active = 1 AND status = ?").bind("energy_hourly_kwh", "ready").first();
  if (!existing) await saveCampusImport(indiaSample.csv, indiaSample.metadata.name, "COMBED · historical measured power");
}

export async function getActiveImports(): Promise<{ datasets: DatasetInfo[]; readings: HourlyReading[] }> {
  const db = getD1();
  const result = await db.prepare("SELECT id, name, resource, building, source, row_count AS rowCount, missing_hours AS missingHours, start_at AS start, end_at AS end FROM campus_imports WHERE active = 1 AND status = ?").bind("ready").all<DatasetInfo>();
  const datasets = result.results ?? [];
  const readings = (await Promise.all(datasets.map(async (dataset) => {
    const result = await db.prepare("SELECT recorded_at AS recordedAt, value FROM campus_import_readings WHERE import_id = ? ORDER BY recorded_at").bind(dataset.id).all<{recordedAt: string; value: number}>();
    return (result.results ?? []).map((row) => ({ ...row, resource: dataset.resource, building: dataset.building, unit: dataset.resource === "energy_hourly_kwh" ? "kWh" : "kL", source: dataset.source } as HourlyReading));
  }))).flat();
  return { datasets, readings };
}

export function previewResponse(preview: CsvPreview) {
  return { ...preview, readings: preview.readings.slice(0, 5) };
}
