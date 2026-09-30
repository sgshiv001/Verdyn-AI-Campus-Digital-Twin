import type { HourlyReading } from "./campus-analytics.ts";

export const MAX_CSV_BYTES = 512_000;
export const MAX_CSV_ROWS = 3_000;
export type CsvPreview = {
  readings: HourlyReading[];
  rowCount: number;
  duplicateCount: number;
  missingHours: number;
  completeDays: number;
  start: string;
  end: string;
  building: string;
  resource: HourlyReading["resource"];
  unit: HourlyReading["unit"];
  warnings: string[];
};

// Quoted fields, escaped quotes, CRLF and a UTF-8 BOM are accepted.
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field.trim() === "") quoted = !quoted;
      else throw new Error("A quote appears inside an unquoted CSV field.");
    } else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function parseCampusCsv(text: string, source = "uploaded CSV"): CsvPreview {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error("Use a CSV smaller than 500 KB.");
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const header = rows.shift()?.map((name) => name.toLowerCase());
  const columns = ["recorded_at", "building", "resource", "value", "unit"];
  if (!header || columns.some((name) => !header.includes(name)) || new Set(header).size !== header.length) {
    throw new Error("CSV headers must include recorded_at, building, resource, value, unit.");
  }
  if (!rows.length || rows.length > MAX_CSV_ROWS) throw new Error(`Use between 1 and ${MAX_CSV_ROWS} hourly rows.`);
  const readings: HourlyReading[] = [], keys = new Map<string, number>();
  let duplicateCount = 0;
  rows.forEach((row, index) => {
    const line = index + 2;
    if (row.length !== header.length) throw new Error(`Row ${line}: column count does not match the header.`);
    const get = (name: string) => row[header.indexOf(name)];
    const timestamp = get("recorded_at"), resource = get("resource"), unit = get("unit");
    const building = get("building"), rawValue = get("value");
    // Explicit offsets avoid silently reading Indian local times as UTC.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:(?:00|30):00(?:\.000)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
      throw new Error(`Row ${line}: use an hourly ISO timestamp with timezone, such as 2014-06-01T00:00:00+05:30.`);
    }
    const date = new Date(timestamp);
    if (new Date(date.getTime() + 330 * 60_000).getUTCMinutes() !== 0) throw new Error(`Row ${line}: readings must start on the hour in India Standard Time.`);
    // Roundtrip the calendar portion to catch JavaScript's overflow of dates such as February 30.
    const offsetMatch = timestamp.match(/([+-])(\d{2}):(\d{2})$/);
    const offset = offsetMatch ? (offsetMatch[1] === "+" ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3])) : 0;
    if (new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19) !== timestamp.slice(0, 19)) throw new Error(`Row ${line}: invalid calendar date.`);
    if (!building || building.length > 100) throw new Error(`Row ${line}: a building name of up to 100 characters is required.`);
    if (!((resource === "energy" && unit === "kWh") || (resource === "water" && unit === "kL"))) throw new Error(`Row ${line}: energy needs kWh; water needs kL. Use hourly consumption, not cumulative meter totals.`);
    if (!/^(?:\d+\.?\d*|\.\d+)$/.test(rawValue)) throw new Error(`Row ${line}: value must be a non-negative number.`);
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value > 1_000_000) throw new Error(`Row ${line}: value is outside the supported range.`);
    const reading = { resource: resource === "energy" ? "energy_hourly_kwh" : "water_hourly_kl", building, recordedAt: date.toISOString(), value, unit, source } as HourlyReading;
    if (readings.length && (readings[0].building !== building || readings[0].resource !== reading.resource)) throw new Error("Import one building and one resource per CSV.");
    const recordedAt = date.toISOString();
    const previous = keys.get(recordedAt);
    if (previous !== undefined) {
      if (previous !== value) throw new Error(`Row ${line}: conflicting values for the same hour.`);
      duplicateCount++; return;
    }
    keys.set(recordedAt, value); readings.push(reading);
  });
  readings.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const first = readings[0], last = readings.at(-1)!;
  if (readings.some((r) => new Date(r.recordedAt).getUTCMinutes() !== new Date(first.recordedAt).getUTCMinutes())) throw new Error("Keep hourly timestamps aligned to one timezone offset.");
  const span = (Date.parse(last.recordedAt) - Date.parse(first.recordedAt)) / 3_600_000;
  if (span > 24 * 366) throw new Error("Import at most one year at a time.");
  const days = new Map<string, Set<number>>();
  readings.forEach((r) => {
    const local = new Date(Date.parse(r.recordedAt) + 330 * 60_000);
    const day = local.toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, new Set());
    days.get(day)!.add(local.getUTCHours());
  });
  const missingHours = span + 1 - readings.length;
  const completeDays = [...days.values()].filter((hours) => hours.size === 24).length;
  const warnings = [];
  if (duplicateCount) warnings.push(`${duplicateCount} identical duplicate rows will be skipped.`);
  if (missingHours) warnings.push(`${missingHours} missing hours; gaps will remain unfilled.`);
  if (completeDays < 4) warnings.push("Forecasting needs at least four complete days of readings.");
  return { readings, rowCount: readings.length, duplicateCount, missingHours, completeDays, start: first.recordedAt, end: last.recordedAt, building: first.building, resource: first.resource, unit: first.unit, warnings };
}
