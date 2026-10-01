import { getD1 } from "@/db";
import type { CsvPreview } from "@/lib/campus-csv";
import { saveBuildingImport, loadBuildingImports, restoreLegacyBuildingImports } from "@/lib/campus-import-store";
import { removeAppFixtures } from "@/lib/campus-fixtures";

export type { DatasetInfo } from "@/lib/campus-import-store";
let prepared = false;
async function prepareUserData() {
  if (prepared) return;
  const db = getD1();
  await removeAppFixtures(db);
  await restoreLegacyBuildingImports(db);
  prepared = true;
}
export async function saveCampusImport(csv: string, name: string) {
  await prepareUserData();
  return saveBuildingImport(getD1(), csv, name, "uploaded CSV · source unverified");
}
export async function getActiveImports() {
  await prepareUserData();
  return loadBuildingImports(getD1());
}
export function previewResponse(preview: CsvPreview) {
  return { ...preview, readings: preview.readings.slice(0, 5) };
}
