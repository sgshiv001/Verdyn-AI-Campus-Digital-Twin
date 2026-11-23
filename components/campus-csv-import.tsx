"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, Check, FileSpreadsheet } from "lucide-react";
import { MAX_CSV_BYTES, type CsvPreview } from "@/lib/campus-csv";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SelectedCsv = {
  id: number;
  name: string;
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

export function CampusCsvImport({ onImported, alwaysOpen = false, openRequest = 0 }: {onImported: (building: string) => Promise<void>; alwaysOpen?: boolean; openRequest?: number}) {
  const [files, setFiles] = useState<SelectedCsv[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(alwaysOpen);
  const working = useRef(false);
  useEffect(() => { if (openRequest) setExpanded(true); }, [openRequest]);

  const chooseFiles = async (selected: File[]) => {
    if (working.current || !selected.length) return;
    working.current = true;
    setBusy(true);
    setError("");
    const next: SelectedCsv[] = selected.map((file, id) => ({id, name: file.name, csv: "", preview: null, status: "checking", error: ""}));
    setFiles([...next]);
    try {
      for (const [id, file] of selected.entries()) {
        try {
          if (file.size > MAX_CSV_BYTES || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a .csv file smaller than 500 KB.");
          const csv = await file.text();
          const response = await fetch("/api/campus/import", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({csv, name: file.name, action: "preview"})});
          const result = await response.json() as CsvPreview & {error?: string};
          if (!response.ok) throw new Error(result.error || "The file could not be checked. Choose it again to retry.");
          next[id] = {...next[id], csv, preview: result, status: "ready"};
        } catch (failure) {
          next[id] = {...next[id], status: "error", error: failure instanceof Error ? failure.message : "The file could not be read."};
        }
        setFiles([...next]);
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const viewSaved = async (building: string) => {
    try {
      await onImported(building);
    } catch {
      setError("Your readings are saved, but the dashboard could not refresh. Choose View saved readings to retry.");
    }
  };

  const save = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    const next = [...files];
    // Retain list order when retrying files for the same building/resource.
    const changedPairs = new Set<string>();
    try {
      for (const [index, file] of next.entries()) {
        if (!file.preview) continue;
        const pair = JSON.stringify([file.preview.building, file.preview.resource]);
        if (file.status === "saved" && !changedPairs.has(pair)) continue;
        changedPairs.add(pair);
        next[index] = {...file, status: "saving", error: ""};
        setFiles([...next]);
        try {
          const response = await fetch("/api/campus/import", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({csv: file.csv, name: file.name, action: "import"})});
          const result = await response.json() as CsvPreview & {error?: string};
          if (!response.ok) throw new Error(result.error || "The import could not be saved. Please retry.");
          next[index] = {...file, preview: result, status: "saved", error: ""};
        } catch (failure) {
          next[index] = {...file, status: "error", error: failure instanceof Error ? failure.message : "The import could not be saved."};
        }
        setFiles([...next]);
      }
      const saved = next.filter((file) => file.status === "saved");
      // Refresh once after the batch. Keep failures visible until retry or navigation.
      if (saved.length && next.every((file) => file.status === "saved")) await viewSaved(saved.at(-1)!.preview!.building);
    } finally {
      working.current = false;
      setBusy(false);
    }
  };

  const pending = files.filter((file) => file.preview && file.status !== "saved");
  const saved = files.filter((file) => file.status === "saved");
  const pairs = files.flatMap((file) => file.preview ? [JSON.stringify([file.preview.building, file.preview.resource])] : []);
  const duplicatePairs = new Set(pairs).size < pairs.length;

  return <section className="csv-import" id="csv-import" aria-label="Import campus readings" aria-busy={busy}>
    <div className="csv-import__head"><div><FileSpreadsheet size={22} /><div><h2>Upload your campus CSVs</h2><p>Choose multiple files. Each file contains one building and one resource.</p></div></div>{!alwaysOpen && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Upload size={16}/>{expanded ? "Close import" : "Import CSV"}</button>}</div>
    {(expanded || alwaysOpen) && <div className="csv-import__body">
      <label htmlFor="campus-csv">Choose CSV files · up to 3,000 rows / 500 KB per file</label>
      <Input id="campus-csv" type="file" accept=".csv,text/csv" multiple disabled={busy} onChange={(event) => {
        const selected = Array.from(event.target.files ?? []);
        event.target.value = "";
        void chooseFiles(selected);
      }} />
      <p>Headers: <code>recorded_at, building, resource, value, unit</code>. Use <code>energy / kWh</code> or <code>water / kL</code>, with hourly consumption and an explicit timezone.</p>
      <a href="/api/campus/template" download>Download a blank CSV template</a>
      <p>Use timestamps with <code>+05:30</code>, aligned to the hour in IST. Four complete days enable forecasting. Smaller files still generate consumption summaries.</p>
      {busy && <p role="status">{files.some((file) => file.status === "checking") ? "Checking files…" : "Saving files…"}</p>}
      {error && <p role="alert" className="csv-error">{error}</p>}
      {duplicatePairs && <p className="csv-warning">Some files share a building and resource. The last successfully saved file in this list becomes its active dataset.</p>}
      <div className="csv-file-list">{files.map((file) => <article className="csv-preview" key={file.id} aria-label={file.name}>
        <div><b className="csv-file-name">{file.name}</b><span>{statusLabels[file.status]}</span></div>
        {file.error && <p role="alert" className="csv-error">{file.error}</p>}
        {file.preview && <>
          <div className="csv-file-details"><b>{file.preview.building} · {file.preview.resource.startsWith("energy") ? "Energy" : "Water"}</b><span>{file.preview.rowCount} hours · {file.preview.completeDays} complete days · {file.preview.unit}</span></div>
          <p>{new Date(file.preview.start).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})} – {new Date(file.preview.end).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})}</p>
          {file.preview.warnings.map((warning) => <p key={warning} className="csv-warning">{warning}</p>)}
          <Table><TableHeader><TableRow><TableHead>First five readings · IST</TableHead><TableHead>Consumption ({file.preview.unit})</TableHead></TableRow></TableHeader><TableBody>{file.preview.readings.map((row) => <TableRow key={row.recordedAt}><TableCell>{new Date(row.recordedAt).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}</TableCell><TableCell>{row.value}</TableCell></TableRow>)}</TableBody></Table>
        </>}
      </article>)}</div>
      {pending.length > 0 && <div className="csv-import-actions"><button type="button" onClick={() => void save()} disabled={busy}><Check size={16}/>{pending.length === 1 ? "Use these readings" : `Import ${pending.length} files`}</button><small>Each file replaces the active dataset for its building and resource. Earlier imports remain saved.</small></div>}
      {saved.length > 0 && <div className="csv-import-actions"><p role="status" className="csv-success">{saved.length} of {files.length} files saved.</p><button type="button" disabled={busy} onClick={() => void viewSaved(saved.at(-1)!.preview!.building)}>View saved readings</button></div>}
    </div>}
  </section>;
}
