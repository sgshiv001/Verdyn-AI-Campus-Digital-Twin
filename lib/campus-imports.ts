import { getD1 } from "@/db";
import { parseCampusCsv, type CsvPreview } from "@/lib/campus-csv";
import { saveBuildingImport, loadBuildingImports, restoreLegacyBuildingImports } from "@/lib/campus-import-store";
import indiaSample from "@/data/india-campus-energy.json";
const indiaBuilding = parseCampusCsv(indiaSample.csv).building;

export type { DatasetInfo } from "@/lib/campus-import-store";

export async function saveCampusImport(csv: string, name: string, source = "uploaded CSV · source unverified") {
  if (csv === indiaSample.csv) {
    name = indiaSample.metadata.name;
    source = "COMBED · historical measured power";
  }
  return saveBuildingImport(getD1(), csv, name, source);
}

export async function ensureIndiaSample() {
  await restoreLegacyBuildingImports(getD1());
  const existing = await getD1().prepare("SELECT id FROM campus_imports WHERE resource = ? AND building = ? AND active = 1 AND status = ?").bind("energy_hourly_kwh", indiaBuilding, "ready").first();
  if (!existing) await saveCampusImport(indiaSample.csv, indiaSample.metadata.name, "COMBED · historical measured power");
}

export async function getActiveImports() { return loadBuildingImports(getD1()); }

export function previewResponse(preview: CsvPreview) {
  return { ...preview, readings: preview.readings.slice(0, 5) };
}
