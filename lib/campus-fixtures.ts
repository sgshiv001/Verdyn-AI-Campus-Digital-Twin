type FixtureDatabase = Pick<D1Database, "prepare" | "batch">;

// Remove only the earlier app-owned sample and explicitly seeded demo records.
// New user CSV imports have a different source/hash and are never matched here.
export async function removeAppFixtures(db: FixtureDatabase) {
  const sampleId = "04766a873aa39e1e03354f08cfbeb9fa54243f59782a928d817414b3ec03df9a";
  const sampleSource = "COMBED · historical measured power";
  await db.batch([
    db.prepare("DELETE FROM campus_import_readings WHERE import_id IN (SELECT id FROM campus_imports WHERE id = ? AND source = ?)").bind(sampleId, sampleSource),
    db.prepare("DELETE FROM campus_imports WHERE id = ? AND source = ?").bind(sampleId, sampleSource),
    db.prepare("DELETE FROM campus_readings WHERE source = ? AND building IN (?, ?) AND resource IN (?, ?, ?, ?)")
      .bind("simulated", "Main Campus", "Science Block", "energy", "water", "energy_hourly_kwh", "water_hourly_kl"),
    db.prepare("DELETE FROM campus_metrics WHERE id IN (?, ?, ?, ?) AND recorded_at = ?")
      .bind("energy", "water", "carbon", "diversion", "2026-09-29T00:00:00.000Z"),
    db.prepare("DELETE FROM campus_alerts WHERE id IN (?, ?) AND created_at = ?")
      .bind("water-flow", "peak-demand", "2026-09-29T00:00:00.000Z"),
    db.prepare("DELETE FROM campus_recommendations WHERE (id = ? AND title = ?) OR (id = ? AND title = ?) OR (id = ? AND title = ?)")
      .bind("hvac", "Delay Library HVAC start", "water", "Inspect Science Block line", "shuttle", "Add one evening shuttle"),
  ]);
}
