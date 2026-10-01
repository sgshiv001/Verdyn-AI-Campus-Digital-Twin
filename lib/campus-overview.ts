import { buildingAnalytics, completeDailyTotals } from "./campus-buildings.ts";
import type { HourlyReading, ReadingAnomaly } from "./campus-analytics.ts";

export type ReviewAction = {
  id: string; title: string; detail: string; building: string;
  resource: "energy" | "water"; recordedAt: string; status: string;
};

export function uploadOverview(analytics: ReturnType<typeof buildingAnalytics>, readings: HourlyReading[]) {
  const selected = readings.filter((reading) => reading.building === analytics?.selectedBuilding);
  const resourceSummary = (resource: HourlyReading["resource"]) => {
    const values = selected.filter((reading) => reading.resource === resource);
    const days = completeDailyTotals(values);
    return { rowCount: values.length, total: values.length ? Number(values.reduce((sum, reading) => sum + reading.value, 0).toFixed(2)) : null,
      completeDays: days.length, latestDay: days.at(-1)?.day ?? null, latestDayTotal: days.at(-1)?.total ?? null };
  };
  const datasets = analytics?.datasets ?? [];
  const rowCount = datasets.reduce((sum, dataset) => sum + dataset.rowCount, 0);
  const missingHours = datasets.reduce((sum, dataset) => sum + dataset.missingHours, 0);
  return {
    status: analytics ? "ready" as const : "empty" as const,
    analytics,
    summaries: {energy: resourceSummary("energy_hourly_kwh"), water: resourceSummary("water_hourly_kl")},
    rowCount, missingHours,
    coveragePercent: rowCount ? Number((rowCount / (rowCount + missingHours) * 100).toFixed(1)) : null,
    series: {energy: analytics?.latestReadings.energy.map((reading) => reading.value) ?? [], water: analytics?.latestReadings.water.map((reading) => reading.value) ?? []},
    alerts: analytics?.anomalies ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export async function readingReviewActions(anomalies: ReadingAnomaly[]): Promise<ReviewAction[]> {
  return Promise.all(anomalies.slice(0, 6).map(async (anomaly) => {
    const key = JSON.stringify([anomaly.building, anomaly.resource, anomaly.recordedAt]);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    const id = "csv-review:" + [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    const resource = anomaly.resource === "energy_hourly_kwh" ? "energy" : "water";
    return {id, title: "Review elevated " + resource + " usage", building: anomaly.building,
      resource, recordedAt: anomaly.recordedAt, status: "new",
      detail: anomaly.reason + " Verify the meter reading and operating schedule before changing equipment."};
  }));
}
