"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { comparisonForDay, type BuildingComparisons } from "@/lib/campus-buildings";

export function BuildingComparison({ comparisons, selectedBuilding, onSelect, busy }: {
  comparisons: BuildingComparisons; selectedBuilding: string; onSelect: (building: string) => void; busy: boolean;
}) {
  const [resource, setResource] = useState<"energy" | "water">("energy");
  const [requestedDay, setRequestedDay] = useState("");
  const comparison = comparisonForDay(comparisons[resource], requestedDay);
  const unit = resource === "energy" ? "kWh" : "kL";
  const max = Math.max(...comparison.rows.map((row) => row.reading?.total ?? 0), 1);
  return <section className="building-comparison" aria-labelledby="building-comparison-title">
    <header><div><p className="section-index">Estate / imported buildings</p><h2 id="building-comparison-title">Compare buildings</h2></div><div className="comparison-controls">
      <label>Resource<NativeSelect aria-label="Comparison resource" value={resource} onChange={(event) => {setResource(event.target.value as "energy" | "water"); setRequestedDay("");}}><NativeSelectOption value="energy">Energy · kWh</NativeSelectOption><NativeSelectOption value="water">Water · kL</NativeSelectOption></NativeSelect></label>
      <label>Shared day · IST<NativeSelect aria-label="Comparison day" value={comparison.day ?? ""} disabled={!comparison.commonDays.length} onChange={(event) => setRequestedDay(event.target.value)}>{!comparison.commonDays.length && <NativeSelectOption value="">No shared complete day</NativeSelectOption>}{[...comparison.commonDays].reverse().map((day) => <NativeSelectOption key={day} value={day}>{day}</NativeSelectOption>)}</NativeSelect></label>
    </div></header>
    <p>{comparison.rows.length < 2 ? "Import CSV readings for another building to compare consumption. Demo readings are excluded." : comparison.aligned ? `Same-day totals for ${comparison.day} · 24 readings per building. Building size and occupancy are not normalized.` : "No shared complete day. Latest available totals are shown with their own dates; these are not a same-day comparison."}</p>
    {comparison.rows.length ? <Table><TableHeader><TableRow><TableHead>Building</TableHead><TableHead>Source</TableHead><TableHead>Complete day · IST</TableHead><TableHead>Consumption ({unit})</TableHead><TableHead><span className="sr-only">Open building</span></TableHead></TableRow></TableHeader><TableBody>{comparison.rows.map((row) => <TableRow key={row.building} data-state={row.building === selectedBuilding ? "selected" : undefined}><TableCell><b>{row.building}</b></TableCell><TableCell><span className="source-pill">{row.source.includes("COMBED") ? "COMBED · historical" : "Uploaded · unverified"}</span></TableCell><TableCell>{row.reading?.day ?? "Not enough readings"}</TableCell><TableCell><div className="comparison-consumption"><strong>{row.reading ? row.reading.total.toLocaleString("en-IN") : "—"}</strong>{comparison.aligned && comparison.rows.length > 1 && row.reading && <span className="comparison-bar" aria-hidden="true"><i style={{width: `${row.reading.total / max * 100}%`}}/></span>}</div></TableCell><TableCell><button type="button" disabled={busy || row.building === selectedBuilding} onClick={() => onSelect(row.building)} aria-label={`View ${row.building}`}><Building2 size={15}/>{row.building === selectedBuilding ? "Selected" : "View"}</button></TableCell></TableRow>)}</TableBody></Table> : <div className="comparison-empty">No imported {resource} datasets yet. <a href="#csv-import">Import a building CSV</a></div>}
  </section>;
}
