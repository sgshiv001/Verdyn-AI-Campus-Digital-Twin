import type { HourlyReading } from "./campus-analytics.ts";

export const MAX_CSV_BYTES = 512_000;
export const MAX_CSV_ROWS = 3_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SIMULATED_CSV_SOURCE = "uploaded CSV · contains simulated readings";
const columns = ["recorded_at", "building", "resource", "value", "unit"];
const simulatedMarker = "SIMULATED_DEMO_NOT_MEASURED";
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
function csvRows(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field.trim() === "") quoted = !quoted;
      else throw new Error("A quote appears inside an unquoted CSV field.");
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ""; }
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
  if (!header || columns.some((name) => !header.includes(name)) || new Set(header).size !== header.length) {
    throw new Error("CSV headers must include recorded_at, building, resource, value, unit.");
  }
  if (!rows.length || rows.length > MAX_CSV_ROWS) throw new Error(`Use between 1 and ${MAX_CSV_ROWS} hourly rows.`);
  const readings: HourlyReading[] = [], keys = new Map<string, number>();
  const sourceColumn = header.indexOf("source_dataset");
  const simulated = sourceColumn >= 0 && rows.some((row) => row[sourceColumn] === simulatedMarker);
  const readingSource = simulated ? SIMULATED_CSV_SOURCE : source;
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
    const reading = { resource: resource === "energy" ? "energy_hourly_kwh" : "water_hourly_kl", building, recordedAt: date.toISOString(), value, unit, source: readingSource } as HourlyReading;
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
  if (simulated) warnings.push("This dataset contains readings labeled as simulated.");
  if (duplicateCount) warnings.push(`${duplicateCount} identical duplicate rows will be skipped.`);
  if (missingHours) warnings.push(`${missingHours} missing hours; gaps will remain unfilled.`);
  if (completeDays < 4) warnings.push("Forecasting needs at least four complete days of readings.");
  return { readings, rowCount: readings.length, duplicateCount, missingHours, completeDays, start: first.recordedAt, end: last.recordedAt, building: first.building, resource: first.resource, unit: first.unit, warnings };
}

type UploadDataset = {label: string; csv: string; preview: CsvPreview} | {label: string; error: string};

function csvField(value: string) {
  return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
}

function litersToKiloliters(value: string) {
  // Shift the decimal point exactly so fractional liters survive conversion.
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(value)) return value;
  const [whole, fraction = ""] = value.split(".");
  const digits = whole.padStart(4, "0");
  return digits.slice(0, -3) + "." + digits.slice(-3) + fraction;
}

function getCsvFormat(text: string) {
  const content = text.trimStart();
  const directive = content.match(/^sep=([,;\t])\r?\n/i);
  if (directive) return {content: content.slice(directive[0].length), delimiter: directive[1]};
  const header = content.split(/[\r\n]/, 1)[0];
  const counts: Record<string, number> = {",": 0, ";": 0, "\t": 0};
  let quoted = false;
  for (const char of header) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && Object.hasOwn(counts, char)) counts[char]++;
  }
  const [delimiter] = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return {content, delimiter};
}

function uploadTimestamp(value: string) {
  const timestamp = value.replace(/\s+(?=\d{1,2}:)/, "T").replace(/\s+(?=[+-]\d{2}:?\d{2}$)/, "");
  const parts = timestamp.match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2})(:\d{2})(:\d{2}(?:\.000)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!parts) return timestamp;
  const [, day, hour, minute, seconds = ":00", zone = ""] = parts;
  const offset = zone.toUpperCase().replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  return day + "T" + hour.padStart(2, "0") + minute + seconds + (offset || "+05:30");
}

export function prepareCampusUpload(text: string, fallbackBuilding = ""): UploadDataset[] {
  if (new TextEncoder().encode(text).length > MAX_UPLOAD_BYTES) throw new Error("Choose a CSV up to 10 MB.");
  const {content, delimiter} = getCsvFormat(text);
  const rows = csvRows(content, delimiter);
  const originalHeader = rows.shift() ?? [];
  const header = originalHeader.map((column) => column.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, ""));
  if (new Set(header).size !== header.length) throw new Error("CSV headers must be unique.");
  const find = (...names: string[]) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const timestampCol = find("recorded_at", "timestamp_local", "timestamp", "timestamp_ist", "datetime", "date_time", "date_time_ist", "reading_time");
  const dateCol = find("date");
  const timeCol = find("time", "hour");
  const buildingCol = find("building", "building_name", "building_id", "site", "block");
  const resourceCol = find("resource", "resource_type");
  const valueCol = find("value", "reading", "consumption");
  const unitCol = find("unit", "units");
  const energyCol = find("electricity_kwh", "energy_kwh", "electricity_consumption_kwh", "energy_consumption_kwh", "consumption_kwh", "kwh", "energy");
  const waterKLCol = find("water_kl", "water_consumption_kl", "kl", "water");
  const waterLitersCol = find("water_liters", "water_litres", "water_l", "water_consumption_liters", "water_consumption_litres", "water_consumption_l");
  const canonical = resourceCol >= 0 && valueCol >= 0 && unitCol >= 0;
  const hasTimestamp = timestampCol >= 0 || (dateCol >= 0 && timeCol >= 0);
  const hasReadings = canonical || energyCol >= 0 || waterKLCol >= 0 || waterLitersCol >= 0;
  if (!hasTimestamp || !hasReadings) {
    const metadata = header.includes("source_dataset") && (header.includes("description") || header.includes("site_id"));
    if (metadata && !hasTimestamp && !hasReadings) {
      throw new Error("This file contains metadata. Choose an hourly readings CSV, such as verdyn_2024-01.csv.");
    }
    const found = originalHeader.slice(0, 8).map((column) => column.slice(0, 40)).join(", ");
    throw new Error("Expected a timestamp and hourly energy or water columns. Found " + (found || "no CSV headers") + ".");
  }
  const defaultBuilding = fallbackBuilding.trim();
  if (buildingCol < 0 && !defaultBuilding) {
    throw new Error("There is no building column. Enter a building name below, then select the file again.");
  }
  const sourceCol = find("source_dataset");
  const energyMissingCol = find("electricity_missing", "energy_missing");
  const waterMissingCol = find("water_missing");
  const groups = new Map<string, {label: string; rows: string[]}>();

  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) throw new Error(`Row ${index + 2}: column count does not match the header.`);
    const get = (column: number) => row[column] ?? "";
    const building = buildingCol < 0 ? defaultBuilding : get(buildingCol);
    const dateTime = timestampCol >= 0 ? get(timestampCol) : get(dateCol) + " " + get(timeCol);
    const timestamp = uploadTimestamp(dateTime);
    const source = get(sourceCol);
    const resourceName = get(resourceCol).toLowerCase();
    const resource = resourceName === "electricity" ? "energy" : resourceName;
    const unit = get(unitCol).toLowerCase();
    const inLiters = resource === "water" && /^(l|liters?|litres?)$/.test(unit);
    const canonicalValue = inLiters ? litersToKiloliters(get(valueCol)) : get(valueCol);
    const canonicalUnit = unit === "kwh" ? "kWh" : (inLiters || unit === "kl") ? "kL" : get(unitCol);
    const water = get(waterKLCol) || litersToKiloliters(get(waterLitersCol));
    const records = canonical ? [[resource, canonicalValue, canonicalUnit]] : [
      ["energy", get(energyMissingCol) === "1" ? "" : get(energyCol), "kWh"],
      ["water", get(waterMissingCol) === "1" ? "" : water, "kL"],
    ];
    for (const [resource, value, unit] of records) {
      if (!canonical && !value) continue;
      const key = JSON.stringify([building, resource]);
      const group = groups.get(key) ?? {label: [building, resource].filter(Boolean).join(" · "), rows: []};
      group.rows.push([timestamp, building, resource, value, unit, source].map(csvField).join(","));
      groups.set(key, group);
    }
  }
  if (!groups.size) throw new Error("The CSV contains no readings.");
  return [...groups.values()].map(({label, rows: groupRows}) => {
    const csv = [...columns, "source_dataset"].join(",") + "\n" + groupRows.join("\n") + "\n";
    try {
      const preview = parseCampusCsv(csv);
      return {label, csv, preview: {...preview, readings: preview.readings.slice(0, 5)}};
    } catch (error) {
      return {label, error: error instanceof Error ? error.message : "These readings could not be checked."};
    }
  });
}
