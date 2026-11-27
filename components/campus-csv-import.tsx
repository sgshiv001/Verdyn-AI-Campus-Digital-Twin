"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Check, FileSpreadsheet } from "lucide-react";
import { MAX_UPLOAD_BYTES, prepareCampusUpload, type CsvPreview } from "@/lib/campus-csv";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SelectedCsv = {
  id: number;
  name: string;
  label?: string;
  csv: string;
  preview: CsvPreview | null;
  status: "checking" | "ready" | "saving" | "saved" | "error";
  error: string;
};

const statusLabels: Record<SelectedCsv["status"], string> = {
  checking: "Checking…",
  ready: "Ready to import",
  saving: "Saving…",
  saved: "Saved",
  error: "Needs attention",
};

async function saveCsv(csv: string, name: string) {
  const fallback = "Could not save these readings. Retry the import.";
  try {
    const response = await fetch("/api/campus/import", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({csv, name, action: "import"}),
      signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json().catch(() => null) as (CsvPreview & {error?: string}) | null;
    if (!response.ok || !result || !Array.isArray(result.readings)) {
      return {error: result?.error || fallback};
    }
    return {preview: result};
  } catch {
    return {error: fallback};
  }
}

async function readCsv(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  try {
    return new TextDecoder(encoding, {fatal: true}).decode(bytes);
  } catch {
    throw new Error("Save the file as UTF-8 CSV and select it again.");
  }
}

export function CampusCsvImport({ onImported, alwaysOpen = false, openRequest = 0 }: {
  onImported: (building: string) => Promise<void>; alwaysOpen?: boolean; openRequest?: number;
}) {
  const [files, setFiles] = useState<SelectedCsv[]>([]);
  const [phase, setPhase] = useState<"checking" | "saving" | "refreshing" | null>(null);
  const [error, setError] = useState("");
  const [defaultBuilding, setDefaultBuilding] = useState("");
  const [expanded, setExpanded] = useState(alwaysOpen);
  const working = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const busy = phase !== null;
  useEffect(() => {
    if (openRequest) {
      setExpanded(true);
      panel.current?.focus({preventScroll: true});
    }
  }, [openRequest]);

  const chooseFiles = async (selected: File[]) => {
    if (working.current || !selected.length) return;
    working.current = true;
    setExpanded(true);
    setPhase("checking");
    setError("");
    const next: SelectedCsv[] = [];
    setFiles([]);
    try {
      for (const file of selected) {
        try {
          if (file.size > MAX_UPLOAD_BYTES || !/\.(csv|tsv)$/i.test(file.name)) throw new Error("Choose a CSV or TSV file up to 10 MB.");
          const datasets = prepareCampusUpload(await readCsv(file), defaultBuilding);
          for (const dataset of datasets) {
            const entry = {id: next.length, name: file.name, label: datasets.length > 1 ? dataset.label : undefined};
            next.push("error" in dataset
              ? {...entry, csv: "", preview: null, status: "error", error: dataset.error}
              : {...entry, csv: dataset.csv, preview: dataset.preview, status: "ready", error: ""});
          }
        } catch (failure) {
          next.push({id: next.length, name: file.name, csv: "", preview: null, status: "error", error: failure instanceof Error ? failure.message : "The file could not be read."});
        }
        setFiles([...next]);
      }
    } finally {
      working.current = false;
      setPhase(null);
    }
  };

  const refreshDashboard = async (building: string) => {
    setError("");
    setPhase("refreshing");
    try {
      await onImported(building);
    } catch {
      setError("Readings saved. Refresh the dashboard to see them.");
    } finally {
      setPhase(null);
    }
  };

  const save = async () => {
    if (working.current) return;
    working.current = true;
    setPhase("saving");
    setError("");
    const next = [...files];
    // Retain list order when retrying files for the same building/resource.
    const changedPairs = new Set<string>();
    let importedBuilding: string | undefined;
    try {
      for (const [index, file] of next.entries()) {
        if (!file.preview) continue;
        const pair = JSON.stringify([file.preview.building, file.preview.resource]);
        if (file.status === "saved" && !changedPairs.has(pair)) continue;
        changedPairs.add(pair);
        next[index] = {...file, status: "saving", error: ""};
        setFiles([...next]);
        const result = await saveCsv(file.csv, file.name);
        if (result.preview) {
          next[index] = {...file, preview: result.preview, status: "saved", error: ""};
          importedBuilding = result.preview.building;
        } else {
          next[index] = {...file, status: "error", error: result.error};
        }
        setFiles([...next]);
      }
      if (importedBuilding) await refreshDashboard(importedBuilding);
    } finally {
      working.current = false;
      setPhase(null);
    }
  };

  const pending = files.filter((file) => file.preview && file.status !== "saved");
  const saved = files.filter((file) => file.status === "saved");
  const lastSaved = saved.at(-1)?.preview?.building;
  const retrying = pending.length > 0 && pending.every((file) => file.status === "error");
  const grouped = files.some((file) => file.label);
  const itemLabel = grouped ? "dataset" : "file";
  const importLabel = retrying ? "Retry failed imports" : "Import " + pending.length + " " + itemLabel + (pending.length === 1 ? "" : "s");
  const pairs = files.flatMap((file) => file.preview ? [JSON.stringify([file.preview.building, file.preview.resource])] : []);
  const duplicatePairs = new Set(pairs).size < pairs.length;

  return <section ref={panel} tabIndex={-1} className="csv-import" id="csv-import" aria-label="Import campus readings">
    <div className="csv-import__head">
      <div><FileSpreadsheet size={22} aria-hidden="true"/><div><h2>Import campus readings</h2><p>Upload standard CSVs or a Verdyn monthly archive.</p></div></div>
      {!alwaysOpen && <button type="button" aria-controls="csv-import-body" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Upload size={16} aria-hidden="true"/>{expanded ? "Close import" : "Open importer"}
      </button>}
    </div>
    <div id="csv-import-body" className="csv-import__body" hidden={!expanded && !alwaysOpen}>
      <div className="csv-picker">
        <input id="campus-csv" type="file" className="sr-only" accept=".csv,.tsv,text/csv,text/tab-separated-values" multiple disabled={busy} aria-describedby="csv-limits" onChange={(event) => {
        const selected = Array.from(event.target.files ?? []);
        event.target.value = "";
        void chooseFiles(selected);
        }} />
        <label htmlFor="campus-csv"><Upload size={16} aria-hidden="true"/>{files.length ? "Choose new files" : "Choose CSV files"}</label>
        <span id="csv-limits">Up to 10 MB per file and 3,000 readings per building and resource</span>
      </div>
      <div className="csv-building-field">
        <label htmlFor="csv-building">Building name (only for files without a building column)</label>
        <input id="csv-building" type="text" maxLength={100} value={defaultBuilding} disabled={busy} onChange={(event) => setDefaultBuilding(event.target.value)} />
      </div>
      <div className="csv-import-actions">
        <details><summary>CSV format</summary>
          <p><code>recorded_at, building, resource, value, unit</code></p>
          <p>Separate meter columns such as <code>energy_kwh</code>, <code>water_kl</code>, and <code>water_liters</code> also work.</p>
          <p>Use hourly ISO timestamps. Timestamps without a timezone are interpreted as IST.</p>
        </details>
        <a href="/api/campus/template" download>Download CSV template</a>
      </div>
      <div role="status" className="csv-progress">
        {phase === "checking" ? "Checking files…" : phase === "saving" ? "Saving " + itemLabel + "s…" : phase === "refreshing" ? "Updating dashboard…" : saved.length ? saved.length + " of " + files.length + " " + itemLabel + "s saved." : ""}
      </div>
      {error && <div className="csv-import-actions">
        <p role="alert" className="csv-error">{error}</p>
        {lastSaved && <button type="button" disabled={busy} onClick={() => void refreshDashboard(lastSaved)}>Refresh dashboard</button>}
      </div>}
      {duplicatePairs && <p className="csv-warning">Some files share a building and resource. The last successfully saved file in this list becomes its active dataset.</p>}
      {pending.length > 0 && <div className="csv-import-actions">
        <button type="button" onClick={() => void save()} disabled={busy}><Check size={16} aria-hidden="true"/>{importLabel}</button>
        <small>Each import sets the active dataset for its building and resource.</small>
      </div>}
      <div className="csv-file-list">{files.map((file) => <article className="csv-preview" key={file.id} aria-label={[file.name, file.label].filter(Boolean).join(" · ")}>
        <div><b className="csv-file-name">{file.name}</b><span className="csv-file-status" data-status={file.status}>{statusLabels[file.status]}</span></div>
        {file.error && <p role="alert" className="csv-error">{file.error}</p>}
        {!file.preview && file.label && <p>{file.label}</p>}
        {file.preview && <>
          <div className="csv-file-details"><b>{file.preview.building} · {file.preview.resource.startsWith("energy") ? "Energy" : "Water"}</b><span>{file.preview.rowCount} hours · {file.preview.completeDays} complete days · {file.preview.unit}</span></div>
          <p>{new Date(file.preview.start).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})} – {new Date(file.preview.end).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})}</p>
          {file.preview.warnings.map((warning) => <p key={warning} className="csv-warning">{warning}</p>)}
          <details><summary>Preview readings</summary>
            <Table><TableHeader><TableRow><TableHead>First five readings · IST</TableHead><TableHead>Consumption ({file.preview.unit})</TableHead></TableRow></TableHeader><TableBody>{file.preview.readings.map((row) => <TableRow key={row.recordedAt}><TableCell>{new Date(row.recordedAt).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}</TableCell><TableCell>{row.value}</TableCell></TableRow>)}</TableBody></Table>
          </details>
        </>}
      </article>)}</div>
    </div>
  </section>;
}
