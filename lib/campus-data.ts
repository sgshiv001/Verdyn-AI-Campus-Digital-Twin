import { getD1 } from "@/db";
import { buildingAnalytics } from "@/lib/campus-buildings";
import { getActiveImports } from "@/lib/campus-imports";
import { uploadOverview, readingReviewActions } from "@/lib/campus-overview";

export async function getCampusAnalytics(building?: string) {
  const imported = await getActiveImports();
  return buildingAnalytics(imported.readings, imported.datasets, building);
}
export async function getCampusOverview(building?: string) {
  const imported = await getActiveImports();
  const analytics = buildingAnalytics(imported.readings, imported.datasets, building);
  const overview = uploadOverview(analytics, imported.readings);
  const recommendations = await readingReviewActions(overview.alerts);
  if (recommendations.length) {
    const db = getD1();
    await db.batch(recommendations.map((action) =>
      db.prepare("INSERT OR IGNORE INTO campus_recommendations (id, title, detail, impact, tag, tone, category, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(action.id, action.title, action.detail, "Review reading", "CSV finding", action.resource === "water" ? "blue" : "lime", action.resource, "new", new Date().toISOString()),
    ));
    const statuses = await db.batch(recommendations.map((action) =>
      db.prepare("SELECT status FROM campus_recommendations WHERE id = ?").bind(action.id),
    ));
    recommendations.forEach((action, index) => {
      action.status = (statuses[index].results?.[0] as {status: string} | undefined)?.status ?? "new";
    });
  }
  return {...overview, recommendations};
}
export async function planRecommendation(id: string) {
  if (!/^csv-review:[a-f0-9]{64}$/.test(id)) return null;
  const result = await getD1().prepare("UPDATE campus_recommendations SET status = ?, updated_at = ? WHERE id = ? AND status != ?")
    .bind("planned", new Date().toISOString(), id, "planned").run();
  if (!result.meta.changes) return null;
  return {id, status: "planned"};
}
