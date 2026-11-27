import { getD1 } from "@/db";
import type { CsvPreview } from "@/lib/campus-csv";
import { saveBuildingImport, loadBuildingImports, restoreLegacyBuildingImports } from "@/lib/campus-import-store";
import { removeAppFixtures } from "@/lib/campus-fixtures";

export type { DatasetInfo } from "@/lib/campus-import-store";
export const UPLOADED_CSV_SOURCE = "uploaded CSV · source unverified";
let preparation: Promise<void> | undefined;
function prepareUserData() {
  const db = getD1();
  preparation ??= removeAppFixtures(db).then(() => restoreLegacyBuildingImports(db)).catch((error) => {
    preparation = undefined;
    throw error;
  });
  return preparation;
}
export async function saveCampusImport(preview: CsvPreview, name: string) {
  await prepareUserData();
  return saveBuildingImport(getD1(), preview, name, UPLOADED_CSV_SOURCE);
}
export async function getActiveImports() {
  await prepareUserData();
  return loadBuildingImports(getD1());
}
export function previewResponse(preview: CsvPreview) {
  return { ...preview, readings: preview.readings.slice(0, 5) };
}
