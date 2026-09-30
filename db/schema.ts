import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const campusImports = sqliteTable("campus_imports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  resource: text("resource").notNull(),
  building: text("building").notNull(),
  source: text("source").notNull(),
  rowCount: integer("row_count").notNull(),
  missingHours: integer("missing_hours").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  status: text("status").notNull().default("staging"),
  active: integer("active").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_imports_resource_active").on(table.resource, table.active)]);

export const campusImportReadings = sqliteTable("campus_import_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: text("import_id").notNull().references(() => campusImports.id),
  recordedAt: text("recorded_at").notNull(),
  value: real("value").notNull(),
}, (table) => [uniqueIndex("idx_import_readings_unique").on(table.importId, table.recordedAt)]);

export const campusReadings = sqliteTable(
  "campus_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: text("recorded_at").notNull(),
    resource: text("resource").notNull(),
    building: text("building").notNull(),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    source: text("source").notNull().default("simulated"),
  },
  (table) => [
    uniqueIndex("idx_readings_unique").on(table.recordedAt, table.resource, table.building),
    index("idx_readings_resource_recorded").on(table.resource, table.recordedAt),
  ],
);

export const campusMetrics = sqliteTable("campus_metrics", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  changeText: text("change_text").notNull(),
  trend: text("trend").notNull(),
  accent: text("accent").notNull(),
  recordedAt: text("recorded_at").notNull(),
});

export const campusAlerts = sqliteTable(
  "campus_alerts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    building: text("building").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_alerts_status_created").on(table.status, table.createdAt)],
);

export const campusRecommendations = sqliteTable(
  "campus_recommendations",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    impact: text("impact").notNull(),
    tag: text("tag").notNull(),
    tone: text("tone").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("new"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_recommendations_status").on(table.status)],
);
