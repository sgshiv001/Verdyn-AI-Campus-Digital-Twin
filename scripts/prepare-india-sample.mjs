// Reproduce the bundled sample from COMBED's publicly released raw CSV archive.
import { mkdir, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";

const url = "https://combed.github.io/downloads/combed.zip";
const size = 44_205_382;
async function range(start, end) {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (response.status !== 206) { await response.body?.cancel(); throw new Error(`Expected HTTP 206; got ${response.status}.`); }
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length !== end - start + 1) throw new Error("Incomplete archive range.");
  return data;
}
const tail = await range(size - 65_536, size - 1);
let eocd = tail.length - 22;
while (eocd >= 0 && tail.readUInt32LE(eocd) !== 0x06054b50) eocd--;
if (eocd < 0) throw new Error("Missing ZIP directory.");
const directory = await range(tail.readUInt32LE(eocd + 16), tail.readUInt32LE(eocd + 16) + tail.readUInt32LE(eocd + 12) - 1);
const entries = [];
for (let position = 0; position < directory.length;) {
  if (directory.readUInt32LE(position) !== 0x02014b50) throw new Error("Invalid ZIP entry.");
  const nameLength = directory.readUInt16LE(position + 28);
  entries.push({ name: directory.subarray(position + 46, position + 46 + nameLength).toString(), method: directory.readUInt16LE(position + 10), size: directory.readUInt32LE(position + 20), offset: directory.readUInt32LE(position + 42) });
  position += 46 + nameLength + directory.readUInt16LE(position + 30) + directory.readUInt16LE(position + 32);
}
if (process.argv.includes("--list")) { console.log(entries); process.exit(0); }
const entry = entries.find((item) => item.name.endsWith("Academic Block/Building Total Mains/0/Power.csv"));
if (!entry) throw new Error("Academic Building mains Power.csv was not found.");
const header = await range(entry.offset, entry.offset + 29);
const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
const compressed = await range(start, start + entry.size - 1);
const raw = entry.method === 8 ? inflateRawSync(compressed) : compressed;
if (process.argv.includes("--inspect")) { console.log(entry, raw.toString().split(/\r?\n/).slice(0, 5)); process.exit(0); }

const hours = new Map();
const seen = new Set();
let rejected = 0;
for (const line of raw.toString().split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [timestamp, power] = line.split(",").map(Number);
  if (!Number.isFinite(timestamp) || !Number.isFinite(power) || power < 0 || seen.has(timestamp)) { rejected++; continue; }
  seen.add(timestamp);
  const local = timestamp + 330 * 60_000;
  const hour = Math.floor(local / 3_600_000) * 3_600_000;
  if (!hours.has(hour)) hours.set(hour, []);
  hours.get(hour).push({ timestamp, power });
}
const valid = [];
if (process.argv.includes("--stats")) {
  const counts = {};
  for (const samples of hours.values()) counts[samples.length] = (counts[samples.length] ?? 0) + 1;
  console.log({ rawRows: seen.size, rejected, counts, first: [...hours.values()][0].slice(0, 3), deltas: [...hours.values()][0].slice(1, 12).map((s, i) => s.timestamp - [...hours.values()][0][i].timestamp) });
  process.exit(0);
}
for (const [hour, samples] of [...hours].sort((a, b) => a[0] - b[0])) {
  samples.sort((a, b) => a.timestamp - b.timestamp);
  // Retain hours with >=98% of nominal samples, bounded edges, and no long gaps.
  const hourUtc = hour - 330 * 60_000;
  if (samples.length < 118 || samples[0].timestamp - hourUtc > 60_000 || hourUtc + 3_600_000 - samples.at(-1).timestamp > 60_000 || samples.some((sample, i) => i && sample.timestamp - samples[i - 1].timestamp > 60_000)) continue;
  const wattMilliseconds = samples.reduce((sum, sample, index) => {
    const segmentStart = index === 0 ? hourUtc : sample.timestamp;
    const segmentEnd = samples[index + 1]?.timestamp ?? hourUtc + 3_600_000;
    return sum + sample.power * (segmentEnd - segmentStart);
  }, 0);
  valid.push({ hour, value: Number((wattMilliseconds / 3_600_000 / 1_000).toFixed(4)), samples: samples.length });
}
const dayCounts = new Map();
valid.forEach(({hour}) => { const day = new Date(hour).toISOString().slice(0, 10); dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1); });
const fullDays = [...dayCounts].filter(([, count]) => count === 24).map(([day]) => day);
if (fullDays.length < 8) throw new Error("Too few complete local days for a useful sample.");
const chosenDays = new Set(fullDays.slice(0, 21));
const sample = valid.filter(({hour}) => chosenDays.has(new Date(hour).toISOString().slice(0, 10)));
const csv = "recorded_at,building,resource,value,unit\n" + sample.map(({hour,value}) => `${new Date(hour).toISOString().slice(0, 19)}+05:30,IIIT-Delhi Academic Block,energy,${value},kWh`).join("\n") + "\n";
const metadata = {
  name: "COMBED · IIIT-Delhi Academic Block",
  sourceUrl: "https://combed.github.io/",
  archiveUrl: url,
  archiveMember: entry.name,
  authors: "Nipun Batra, Oliver Parson, Mario Berges, Amarjeet Singh, Alex Rogers",
  paper: "https://arxiv.org/abs/1408.6595",
  timezone: "Asia/Kolkata",
  conversion: "Estimated hourly kWh from timestamp-weighted integration of active power in watts. Each reading is held until the next reading; first/last values extend to the hour boundary. Retain hours with at least 118 of 120 nominal 30-second samples (>=98.3%), no gap over 60 seconds and boundary gaps at most 60 seconds. Retain complete IST days. Original dates and measured power preserved; no scaling or injected anomalies.",
  minimumSamplesPerHour: Math.min(...sample.map((hour) => hour.samples)),
  originalCsvSha256: createHash("sha256").update(raw).digest("hex"),
  sampleCsvSha256: createHash("sha256").update(csv).digest("hex"),
  rawRows: seen.size,
  rejectedRawRows: rejected,
  retainedDays: chosenDays.size,
  start: sample[0].hour,
  end: sample.at(-1).hour,
};
await mkdir("public/data", { recursive: true });
await mkdir("data", { recursive: true });
await writeFile("public/data/india-campus-energy.csv", csv);
await writeFile("data/india-campus-energy.json", JSON.stringify({ metadata, csv }, null, 2) + "\n");
console.log(JSON.stringify({ metadata, hourlyRows: sample.length }, null, 2));
