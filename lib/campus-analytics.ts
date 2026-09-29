export type HourlyReading = {
  resource: "energy_hourly_kwh" | "water_hourly_kl";
  building: string;
  recordedAt: string;
  value: number;
  unit: "kWh" | "kL";
  source: string;
};

export type ForecastPoint = {
  recordedAt: string;
  value: number;
  lower: number;
  upper: number;
};

export type ResourceForecast = {
  resource: HourlyReading["resource"];
  building: string;
  unit: HourlyReading["unit"];
  horizon: string;
  method: string;
  historicalDays: number;
  typicalErrorPercent: number;
  total: number;
  peak: { recordedAt: string; value: number };
  points: ForecastPoint[];
};

export type ReadingAnomaly = {
  id: string;
  resource: HourlyReading["resource"];
  building: string;
  recordedAt: string;
  observed: number;
  expected: number;
  unit: HourlyReading["unit"];
  deltaPercent: number;
  confidence: number;
  severity: "high" | "medium";
  title: string;
  detail: string;
  reason: string;
};

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const hourOf = (reading: HourlyReading) => new Date(reading.recordedAt).getUTCHours();
const dayOf = (reading: HourlyReading) => reading.recordedAt.slice(0, 10);
const labelHour = (recordedAt: string) => new Date(recordedAt).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });

function baseline(history: HourlyReading[], hour: number) {
  const sameHour = history.filter((reading) => hourOf(reading) === hour).map((reading) => reading.value);
  if (sameHour.length < 3) return null;
  const expected = median(sameHour);
  const mad = median(sameHour.map((value) => Math.abs(value - expected)));
  const robustSigma = 1.4826 * mad;
  return { expected, robustSigma, count: sameHour.length };
}

function latestCompleteDay(readings: HourlyReading[]) {
  const days = [...new Set(readings.map(dayOf))].sort();
  return [...days].reverse().find((day) => new Set(readings.filter((reading) => dayOf(reading) === day).map(hourOf)).size === 24);
}

export function analyzeResource(readings: HourlyReading[]): { forecast: ResourceForecast | null; anomalies: ReadingAnomaly[] } {
  const valid = readings
    .filter((reading) => Number.isFinite(reading.value) && reading.value >= 0 && Number.isFinite(Date.parse(reading.recordedAt)))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (!valid.length) return { forecast: null, anomalies: [] };
  const completeDay = latestCompleteDay(valid);
  if (!completeDay) return { forecast: null, anomalies: [] };
  const currentDay = valid.filter((reading) => dayOf(reading) === completeDay);
  const history = valid.filter((reading) => dayOf(reading) < completeDay);
  const historicalDays = new Set(history.map(dayOf)).size;
  if (historicalDays < 3) return { forecast: null, anomalies: [] };

  const samples = Array.from({ length: 24 }, (_, hour) => baseline(history, hour));
  if (samples.some((sample) => !sample)) return { forecast: null, anomalies: [] };
  const baselines = samples as NonNullable<(typeof samples)[number]>[];
  const [first] = currentDay;
  const nextDay = new Date(completeDay + "T00:00:00.000Z");
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const points = baselines.map((item, hour) => {
    const date = new Date(nextDay);
    date.setUTCHours(hour);
    const margin = Math.max(item.expected * 0.15, item.robustSigma * 2);
    return {
      recordedAt: date.toISOString(),
      value: round(item.expected, first.unit === "kL" ? 2 : 1),
      lower: round(Math.max(0, item.expected - margin), first.unit === "kL" ? 2 : 1),
      upper: round(item.expected + margin, first.unit === "kL" ? 2 : 1),
    };
  });
  const peak = points.reduce((highest, point) => point.value > highest.value ? point : highest);
  const errors = currentDay.map((reading) => {
    const expected = baselines[hourOf(reading)].expected;
    return Math.abs(reading.value - expected) / Math.max(expected, 0.01);
  });
  const typicalErrorPercent = round(median(errors) * 100);
  const resource = first.resource;
  const title = resource === "water_hourly_kl" ? "Water flow above pattern" : "Energy draw above pattern";
  const anomalies = currentDay.flatMap((reading) => {
    const sample = baselines[hourOf(reading)];
    const difference = reading.value - sample.expected;
    const threshold = Math.max(sample.expected * 0.3, sample.robustSigma * 3, resource === "water_hourly_kl" ? 0.4 : 70);
    if (difference <= threshold) return [];
    const deltaPercent = round((difference / Math.max(sample.expected, 0.01)) * 100);
    const confidence = Math.min(99, Math.round(60 + Math.min(39, (difference / threshold - 1) * 25) + Math.min(5, historicalDays - 3)));
    const severity = difference > threshold * 1.5 ? "high" : "medium";
    const observed = round(reading.value, reading.unit === "kL" ? 2 : 1);
    const expected = round(sample.expected, reading.unit === "kL" ? 2 : 1);
    return [{
      id: `${resource}:${reading.recordedAt}`,
      resource,
      building: reading.building,
      recordedAt: reading.recordedAt,
      observed,
      expected,
      unit: reading.unit,
      deltaPercent,
      confidence,
      severity,
      title,
      detail: `${reading.building} · ${labelHour(reading.recordedAt)} UTC`,
      reason: `${observed} ${reading.unit} observed versus ${expected} ${reading.unit} typical at this hour (+${deltaPercent}%).`,
    } satisfies ReadingAnomaly];
  });
  return {
    forecast: {
      resource,
      building: first.building,
      unit: first.unit,
      horizon: "next 24 hours",
      method: "same-hour median of prior days",
      historicalDays,
      typicalErrorPercent,
      total: round(points.reduce((sum, point) => sum + point.value, 0), first.unit === "kL" ? 2 : 1),
      peak: { recordedAt: peak.recordedAt, value: peak.value },
      points,
    },
    anomalies,
  };
}

export function analyzeCampus(readings: HourlyReading[]) {
  const energy = analyzeResource(readings.filter((reading) => reading.resource === "energy_hourly_kwh"));
  const water = analyzeResource(readings.filter((reading) => reading.resource === "water_hourly_kl"));
  return {
    dataSource: "simulated hourly readings",
    forecasts: { energy: energy.forecast, water: water.forecast },
    anomalies: [...water.anomalies, ...energy.anomalies].sort((a, b) => b.confidence - a.confidence),
  };
}
