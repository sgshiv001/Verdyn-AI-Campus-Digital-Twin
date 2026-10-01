import { analyzeCampus, backtestResource, type HourlyReading } from "./campus-analytics.ts";
import type { DatasetInfo } from "./campus-import-store.ts";

export type BuildingInfo = { name: string; isDemo: boolean; resources: string[] };
export type ComparisonBuilding = { building: string; source: string; days: { day: string; total: number }[] };
export type BuildingComparisons = { energy: ComparisonBuilding[]; water: ComparisonBuilding[] };
export class BuildingNotFoundError extends Error {}
const localDay = (reading: HourlyReading, timeZone: string) => new Date(Date.parse(reading.recordedAt) + (timeZone === "Asia/Kolkata" ? 330 * 60_000 : 0)).toISOString().slice(0, 10);

export function completeDailyTotals(readings: HourlyReading[], timeZone = "Asia/Kolkata") {
  const days = new Map<string, HourlyReading[]>();
  for (const reading of readings) {
    const day = localDay(reading, timeZone);
    days.set(day, [...(days.get(day) ?? []), reading]);
  }
  return [...days.entries()].filter(([, values]) => new Set(values.map((value) => value.recordedAt)).size === 24)
    .map(([day, values]) => ({ day, total: Number(values.reduce((sum, value) => sum + value.value, 0).toFixed(2)) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function comparisonForDay(entries: ComparisonBuilding[], requestedDay = "") {
  const commonDays = (entries[0]?.days.map((value) => value.day) ?? [])
    .filter((day) => entries.every((entry) => entry.days.some((value) => value.day === day))).sort();
  const day = commonDays.includes(requestedDay) ? requestedDay : commonDays.at(-1) ?? null;
  return { commonDays, day, aligned: day !== null, rows: entries.map((entry) => ({
    building: entry.building, source: entry.source,
    reading: day ? entry.days.find((value) => value.day === day)! : entry.days.at(-1) ?? null,
  })) };
}

export function buildingAnalytics(readings: HourlyReading[], datasets: DatasetInfo[], requestedBuilding?: string) {
  const names = [...new Set([...readings.map((reading) => reading.building), ...datasets.map((dataset) => dataset.building)])].sort();
  const selectedBuilding = requestedBuilding || datasets.find((dataset) => dataset.resource === "energy_hourly_kwh")?.building || names[0];
  if (!selectedBuilding || !names.includes(selectedBuilding)) throw new BuildingNotFoundError("This building is not available. Choose a connected building.");
  const selected = readings.filter((reading) => reading.building === selectedBuilding);
  const analysis = analyzeCampus(selected);
  const forResource = (resource: HourlyReading["resource"]) => selected.filter((reading) => reading.resource === resource);
  const timeZone = (values: HourlyReading[]) => values[0]?.source === "simulated" ? "UTC" : "Asia/Kolkata";
  const latest = (values: HourlyReading[]) => {
    const day = completeDailyTotals(values, timeZone(values)).at(-1)?.day;
    return day ? values.filter((reading) => localDay(reading, timeZone(values)) === day) : [];
  };
  const buildings: BuildingInfo[] = names.map((name) => ({name,
    isDemo: !datasets.some((dataset) => dataset.building === name),
    resources: [...new Set(readings.filter((reading) => reading.building === name).map((reading) => reading.resource))],
  }));
  const comparisons = (resource: HourlyReading["resource"]) => datasets.filter((dataset) => dataset.resource === resource).map((dataset) => ({
    building: dataset.building, source: dataset.source,
    days: completeDailyTotals(readings.filter((reading) => reading.building === dataset.building && reading.resource === resource)),
  }));
  const energy = forResource("energy_hourly_kwh"), water = forResource("water_hourly_kl");
  return { ...analysis, selectedBuilding, buildings,
    datasets: datasets.filter((dataset) => dataset.building === selectedBuilding),
    comparisons: { energy: comparisons("energy_hourly_kwh"), water: comparisons("water_hourly_kl") },
    evaluation: { energy: backtestResource(energy, timeZone(energy)), water: backtestResource(water, timeZone(water)) },
    latestReadings: { energy: latest(energy), water: latest(water) },
    resources: { energy: energy[0]?.source ?? null, water: water[0]?.source ?? null },
    analysisDays: {
      energy: completeDailyTotals(energy, timeZone(energy)).at(-1)?.day ?? null,
      water: completeDailyTotals(water, timeZone(water)).at(-1)?.day ?? null,
    },
  };
}
