import { parseCampusCsv } from "./campus-csv.ts";
import type { HourlyReading } from "./campus-analytics.ts";

export type DatasetInfo = {
  id: string; name: string; resource: string; building: string; source: string;
  rowCount: number; missingHours: number; start: string; end: string;
};
type ImportDatabase = Pick<D1Database, "prepare" | "batch">;

export async function saveBuildingImport(db: ImportDatabase, csv: string | ReturnType<typeof parseCampusCsv>, name: string, source: string) {
  const preview = typeof csv === "string" ? parseCampusCsv(csv, source) : csv;
  const readingSource = preview.readings[0].source;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(preview.readings)));
  const id = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await db.prepare("INSERT OR IGNORE INTO campus_imports (id, name, resource, building, source, row_count, missing_hours, start_at, end_at, status, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, name.slice(0, 100), preview.resource, preview.building, readingSource, preview.rowCount, preview.missingHours, preview.start, preview.end, "staging", 0, new Date().toISOString()).run();
  const inserts = [];
  const rowsPerInsert = 30;
  for (let start = 0; start < preview.readings.length; start += rowsPerInsert) {
    const readings = preview.readings.slice(start, start + rowsPerInsert);
    const placeholders = readings.map(() => "(?, ?, ?)").join(", ");
    const values = readings.flatMap((reading) => [id, reading.recordedAt, reading.value]);
    inserts.push(db.prepare("INSERT OR IGNORE INTO campus_import_readings (import_id, recorded_at, value) VALUES " + placeholders).bind(...values));
  }
  for (let start = 0; start < inserts.length; start += 20) {
    await db.batch(inserts.slice(start, start + 20));
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM campus_import_readings WHERE import_id = ?").bind(id).first<{count: number}>();
  if (count?.count !== preview.rowCount) throw new Error("The import did not finish. Your previous dataset remains active; please retry.");
  // Replace only this building/resource, in one atomic transaction.
  await db.batch([
    db.prepare("UPDATE campus_imports SET active = 0 WHERE resource = ? AND building = ?").bind(preview.resource, preview.building),
    db.prepare("UPDATE campus_imports SET status = ?, active = 1 WHERE id = ?").bind("ready", id),
  ]);
  return { id, ...preview };
}

export async function restoreLegacyBuildingImports(db: ImportDatabase) {
  // Legacy imports were switched off globally. Restore the most recent ready
  // import only for pairs without an active dataset; never overwrite a selection.
  await db.prepare(`UPDATE campus_imports SET active = 1 WHERE id IN (
    SELECT candidate.id FROM campus_imports AS candidate
    WHERE candidate.status = 'ready' AND candidate.active = 0
      AND NOT EXISTS (SELECT 1 FROM campus_imports AS current
        WHERE current.resource = candidate.resource AND current.building = candidate.building
          AND current.status = 'ready' AND current.active = 1)
      AND NOT EXISTS (SELECT 1 FROM campus_imports AS newer
        WHERE newer.resource = candidate.resource AND newer.building = candidate.building
          AND newer.status = 'ready' AND (newer.created_at > candidate.created_at
            OR (newer.created_at = candidate.created_at AND newer.id > candidate.id)))
  )`).run();
}

export async function loadBuildingImports(db: ImportDatabase): Promise<{datasets: DatasetInfo[]; readings: HourlyReading[]}> {
  const result = await db.prepare("SELECT id, name, resource, building, source, row_count AS rowCount, missing_hours AS missingHours, start_at AS start, end_at AS end FROM campus_imports WHERE active = 1 AND status = ? ORDER BY building, resource").bind("ready").all<DatasetInfo>();
  const datasets = result.results ?? [];
  const readings = (await Promise.all(datasets.map(async (dataset) => {
    const result = await db.prepare("SELECT recorded_at AS recordedAt, value FROM campus_import_readings WHERE import_id = ? ORDER BY recorded_at").bind(dataset.id).all<{recordedAt: string; value: number}>();
    return (result.results ?? []).map((row) => ({ ...row, resource: dataset.resource, building: dataset.building, unit: dataset.resource === "energy_hourly_kwh" ? "kWh" : "kL", source: dataset.source } as HourlyReading));
  }))).flat();
  return { datasets, readings };
}
