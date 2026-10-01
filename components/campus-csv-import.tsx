"use client";

import { useState } from "react";
import { Upload, Check, FileSpreadsheet } from "lucide-react";
import type { CsvPreview } from "@/lib/campus-csv";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Preview = Omit<CsvPreview, "readings"> & {readings: CsvPreview["readings"]};
export function CampusCsvImport({ onImported }: {onImported: (building: string) => Promise<void>}) {
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [expanded, setExpanded] = useState(false);
  const chooseFile = async (file?: File) => {
    setError(""); setSaved(""); setPreview(null); setCsv("");
    if (!file) return;
    setName(file.name);
    if (file.size > 512_000 || !file.name.toLowerCase().endsWith(".csv")) { setError("Choose a .csv file smaller than 500 KB."); return; }
    setBusy(true);
    try {
      const text = await file.text(); setCsv(text);
      const response = await fetch("/api/campus/import", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({csv: text, name: file.name, action: "preview"})});
      const result = await response.json() as Preview & {error?: string};
      if (!response.ok) throw new Error(result.error);
      setPreview(result);
    } catch (error) { setError(error instanceof Error ? error.message : "The file could not be read."); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError(""); setSaved("");
    try {
      const response = await fetch("/api/campus/import", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({csv, name, action: "import"})});
      const result = await response.json() as Preview & {error?: string};
      if (!response.ok) throw new Error(result.error);
      setSaved(`${result.rowCount} hourly readings saved for ${result.building}. Other buildings are unchanged.`);
      setPreview(null);
      await onImported(result.building);
    } catch (error) { setError(error instanceof Error ? error.message : "The import could not be saved."); }
    finally { setBusy(false); }
  };
  const previewSample = async () => {
    setError("");
    try {
      const response = await fetch("/data/india-campus-energy.csv");
      if (!response.ok) throw new Error("The sample could not be loaded.");
      await chooseFile(new File([await response.text()], "india-campus-energy.csv", {type:"text/csv"}));
    } catch (error) { setError(error instanceof Error ? error.message : "The sample could not be loaded."); }
  };
  return <section className="csv-import" id="csv-import" aria-label="Import campus readings">
    <div className="csv-import__head"><div><FileSpreadsheet size={22} /><div><h2>Bring your campus data</h2><p>Hourly energy or water readings for one building, in India Standard Time.</p></div></div><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Upload size={16}/>{expanded ? "Close import" : "Import CSV"}</button></div>
    {expanded && <div className="csv-import__body">
      <label htmlFor="campus-csv">Choose a CSV · up to 3,000 rows / 500 KB</label>
      <Input id="campus-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} />
      <p>Headers: <code>recorded_at, building, resource, value, unit</code>. Use <code>energy / kWh</code> or <code>water / kL</code>, with hourly consumption and an explicit timezone.</p>
      <div className="csv-sample-actions"><button type="button" disabled={busy} onClick={() => void previewSample()}>Preview Indian sample</button><a href="/data/india-campus-energy.csv" download>Download the Indian campus CSV</a></div>
      <pre>2014-06-03T00:00:00+05:30,IIIT-Delhi Academic Block,energy,40.5,kWh</pre>
      {busy && <p role="status">Checking and saving readings…</p>}
      {error && <p role="alert" className="csv-error">{error}</p>}
      {preview && <div className="csv-preview"><div><b>{preview.building}</b><span>{preview.rowCount} hours · {preview.completeDays} complete days · {preview.unit}</span></div><p>{new Date(preview.start).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})} – {new Date(preview.end).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})}</p>{preview.warnings.map((warning) => <p key={warning} className="csv-warning">{warning}</p>)}<Table><TableHeader><TableRow><TableHead>First five readings · IST</TableHead><TableHead>Consumption ({preview.unit})</TableHead></TableRow></TableHeader><TableBody>{preview.readings.map((row) => <TableRow key={row.recordedAt}><TableCell>{new Date(row.recordedAt).toLocaleString("en-IN", {timeZone:"Asia/Kolkata"})}</TableCell><TableCell>{row.value}</TableCell></TableRow>)}</TableBody></Table><button type="button" onClick={() => void save()} disabled={busy}><Check size={16}/>Use these readings</button><small>Replaces only {preview.building}'s {preview.resource.startsWith("energy") ? "energy" : "water"} dataset. Other buildings and earlier imports are kept.</small></div>}
    </div>}
    {saved && <p role="status" className="csv-success">{saved}</p>}
  </section>;
}
