"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Building2, Check, CircleAlert, Droplets, FileSpreadsheet, Gauge, Leaf, ListChecks, Menu, Upload, Zap } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { CampusCsvImport } from "@/components/campus-csv-import";
import { BuildingComparison } from "@/components/building-comparison";
import type { ResourceForecast } from "@/lib/campus-analytics";
import type { uploadOverview, ReviewAction } from "@/lib/campus-overview";

type Overview = ReturnType<typeof uploadOverview> & {recommendations: ReviewAction[]};
const nav = [[Gauge, "Overview", "pulse"], [Building2, "Buildings", "estate"], [Zap, "Energy", "energy"], [Droplets, "Water", "water"], [CircleAlert, "Alerts", "anomaly-details"], [ListChecks, "Actions", "actions"]] as const;
type Section = typeof nav[number][2];
const format = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-IN");
const date = (value: string) => new Date(value).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"});
const time = (value: string) => new Date(value).toLocaleString("en-IN", {timeZone:"Asia/Kolkata", dateStyle:"medium", timeStyle:"short"});

function Spark({values, color}: {values: number[]; color: string}) {
  const max = Math.max(...values, 1) * 1.12;
  const points = values.map((value, index) => (index / Math.max(values.length - 1, 1) * 100) + "," + (95 - value / max * 85)).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function ForecastCard({forecast, resource, connected}: {forecast: ResourceForecast | null; resource:"energy"|"water"; connected:boolean}) {
  if (!forecast) return <article className="forecast-card"><h3>{resource === "energy" ? "Energy" : "Water"} forecast unavailable</h3><p>{connected ? "Add at least four complete days of hourly readings. Missing hours are never filled with invented values." : "Upload a " + resource + " CSV for this building."}</p></article>;
  return <article className="forecast-card"><div className="forecast-card__head"><div><span>From your CSV · {date(forecast.points[0].recordedAt)}</span><h3>{resource === "energy" ? "Energy" : "Water"} forecast</h3></div><b>{forecast.historicalDays} earlier days</b></div><div className="forecast-card__numbers"><strong>{format(forecast.total)}</strong><span>{forecast.unit} predicted</span></div><p>Next day after the analysed readings; not a live sensor forecast.</p><div className="forecast-card__line"><Spark values={forecast.points.map((point) => point.value)} color={resource === "energy" ? "#c8ff4d" : "#4ed2ff"}/></div><div className="forecast-card__foot"><span>Peak {forecast.peak.value} {forecast.unit} · {new Date(forecast.peak.recordedAt).toLocaleTimeString("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"})} IST</span><span>Same-hour median of prior readings</span></div></article>;
}

export default function Home() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [importRequest, setImportRequest] = useState(0);
  const [section, setSection] = useState<Section>("pulse");
  const [planning, setPlanning] = useState<string | null>(null);
  const sequence = useRef(0);
  const loadOverview = useCallback(async (building = "", allowFallback = false) => {
    const request = ++sequence.current;
    setLoading(true); setError("");
    try {
      let response = await fetch("/api/campus/overview" + (building ? "?building=" + encodeURIComponent(building) : ""));
      if (response.status === 404 && allowFallback && building) response = await fetch("/api/campus/overview");
      const next = await response.json() as Overview & {error?:string};
      if (!response.ok) throw new Error(next.error || "Your saved readings could not be loaded.");
      if (request !== sequence.current) return;
      setOverview(next);
      const url = new URL(window.location.href);
      if (next.analytics) url.searchParams.set("building", next.analytics.selectedBuilding);
      else {url.searchParams.delete("building"); url.hash = "";}
      window.history.replaceState(window.history.state, "", url);
      setNotice(next.analytics ? "Showing " + next.analytics.selectedBuilding + "." : "");
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : "The data service is unavailable.");
      throw failure;
    } finally {if (request === sequence.current) setLoading(false);}
  }, []);
  useEffect(() => {
    void loadOverview(new URL(window.location.href).searchParams.get("building") || "", true).catch(() => undefined);
    return () => {sequence.current++;};
  }, [loadOverview]);
  useEffect(() => {
    const sync = () => {
      const current = nav.find((item) => item[2] === window.location.hash.slice(1));
      setSection(current?.[2] ?? "pulse");
    };
    sync(); window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const context = (document as unknown as {modelContext?: {registerTool?: (tool: Record<string,unknown>,options?:{signal?:AbortSignal}) => void|Promise<void>}}).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.resolve(context.registerTool({name:"get_campus_sustainability_snapshot",title:"Read uploaded campus analytics",description:"Read results calculated from the user's uploaded CSV. Empty until readings are imported.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:() => ({status:overview?.status ?? "loading", building:overview?.analytics?.selectedBuilding ?? null, summaries:overview?.summaries ?? null, alerts:overview?.alerts ?? []})}, {signal:controller.signal})).catch(() => undefined);
    return () => controller.abort();
  }, [overview]);
  const chooseBuilding = (building: string) => {void loadOverview(building).catch(() => undefined);};
  const plan = async (id:string) => {
    setPlanning(id); setError("");
    try {
      const response = await fetch("/api/campus/recommendations/" + encodeURIComponent(id) + "/plan",{method:"POST"});
      if (!response.ok) throw new Error("The review action could not be saved. Please retry.");
      setOverview((current) => current ? {...current,recommendations:current.recommendations.map((action) => action.id === id ? {...action,status:"planned"} : action)} : current);
      setNotice("Review action saved to your plan.");
    } catch (failure) {setError(failure instanceof Error ? failure.message : "Unable to save this action.");}
    finally {setPlanning(null);}
  };
  const analytics = overview?.analytics;
  const retry = () => {void loadOverview(analytics?.selectedBuilding || "", true).catch(() => undefined);};
  const imported = async (building:string) => {await loadOverview(building);};
  const errorNotice = error && <p className="building-error" role="alert">{error} <button type="button" onClick={retry} disabled={loading}>Retry</button></p>;

  if (!analytics || !overview) return <main className="csv-start csv-app">
    <header className="csv-start__brand"><span className="atlas-mark"><Leaf size={20}/></span><div><b>Verdyn</b><span>Campus CSV analytics</span></div></header>
    <section className="upload-intro"><p className="section-index">Your data / your campus</p><h1>Start with your CSV.</h1><p>Upload hourly energy or water consumption to generate your campus dashboard. No readings are pre-filled.</p></section>
    {errorNotice}
    {loading && <p className="upload-loading" role="status">Checking for your saved readings…</p>}
    {!loading && <CampusCsvImport onImported={imported} alwaysOpen/>}
    <Empty className="upload-help"><EmptyHeader><EmptyMedia><Activity size={24}/></EmptyMedia><EmptyTitle>Results appear after you import</EmptyTitle><EmptyDescription>Consumption totals and charts use your readings. Four complete days enable forecasts and unusual-usage checks. Add other buildings to compare them.</EmptyDescription></EmptyHeader></Empty>
  </main>;

  return <SidebarProvider defaultOpen><div className="atlas csv-app min-h-screen w-full">
    <Sidebar collapsible="icon" className="atlas-sidebar hidden border-0 md:flex">
      <SidebarHeader className="p-4 pt-5"><div className="flex items-center gap-3"><div className="atlas-mark"><Leaf size={19}/></div><div className="group-data-[collapsible=icon]:hidden"><b className="text-white">Verdyn</b><p>Campus analytics</p></div></div></SidebarHeader>
      <SidebarContent className="mt-7 px-3"><SidebarGroup><SidebarGroupLabel>Navigate</SidebarGroupLabel><SidebarGroupContent><nav aria-label="Campus sections"><SidebarMenu>{nav.map(([Icon,label,id]) => <SidebarMenuItem key={id}><SidebarMenuButton asChild tooltip={label} isActive={section === id}><a href={"#"+id} aria-current={section === id ? "location" : undefined} onClick={() => {setSection(id);setMenuOpen(false);}}><Icon size={17}/><span>{label}</span></a></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="p-3"><div className="atlas-side-status"><b>{analytics.buildings.length} uploaded buildings</b><span>Results from your CSV only</span></div></SidebarFooter>
    </Sidebar>
    <main className="atlas-main min-w-0 flex-1">
      <header className="atlas-header"><button className="atlas-menu md:hidden" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="campus-mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/></button><div><p className="eyebrow">{analytics.selectedBuilding}</p><h1>Campus dashboard</h1></div><a className="upload-link" href="#csv-import" onClick={() => setImportRequest((current) => current + 1)}><Upload size={17}/>Import CSV</a></header>
      <nav id="campus-mobile-navigation" className="atlas-mobile md:hidden" aria-label="Mobile campus sections" hidden={!menuOpen}>{nav.map(([,label,id]) => <a key={id} href={"#"+id} onClick={() => {setSection(id);setMenuOpen(false);}}>{label}</a>)}</nav>
      <div className="building-toolbar" aria-busy={loading}><div><Building2 size={21}/><label htmlFor="campus-building">Selected building<NativeSelect id="campus-building" value={analytics.selectedBuilding} disabled={loading} onChange={(event) => chooseBuilding(event.target.value)}>{analytics.buildings.map((building) => <NativeSelectOption key={building.name} value={building.name}>{building.name}</NativeSelectOption>)}</NativeSelect></label></div><p role="status">{loading ? "Loading readings…" : "Forecasts and alerts stay separate for each building."}</p></div>
      {errorNotice}
      <section id="pulse" className="csv-summary campus-section" tabIndex={-1} aria-label="Uploaded data overview">
        <article className="csv-summary__lead"><FileSpreadsheet size={26}/><p>Your uploaded period</p><h2>{analytics.selectedBuilding}</h2><span>{analytics.datasets.map((dataset) => (dataset.resource.startsWith("energy") ? "Energy" : "Water") + ": " + date(dataset.start) + " – " + date(dataset.end)).join(" · ")}</span><small>File attribution is user-provided and unverified. No carbon or sustainability score is inferred.</small></article>
        <div className="csv-stat-grid"><article><Zap size={19}/><p>Total uploaded energy</p><strong>{format(overview.summaries.energy.total)} <span>kWh</span></strong><small>{overview.summaries.energy.rowCount ? overview.summaries.energy.rowCount + " hourly readings" : "No energy CSV connected"}</small></article><article><Droplets size={19}/><p>Total uploaded water</p><strong>{format(overview.summaries.water.total)} <span>kL</span></strong><small>{overview.summaries.water.rowCount ? overview.summaries.water.rowCount + " hourly readings" : "No water CSV connected"}</small></article><article><Activity size={19}/><p>Record coverage</p><strong>{format(overview.coveragePercent)} <span>%</span></strong><small>{overview.missingHours} missing hourly slots · gaps unfilled</small></article><article><CircleAlert size={19}/><p>Flagged readings</p><strong>{overview.alerts.length}</strong><small>{analytics.forecasts.energy || analytics.forecasts.water ? "Latest analysed complete day" : "More history needed to check patterns"}</small></article></div>
      </section>
      <div className="forecast-section">{(["energy","water"] as const).map((resource) => <section className="campus-section" id={resource} key={resource} tabIndex={-1} aria-label={resource === "energy" ? "Energy outlook" : "Water outlook"}><ForecastCard forecast={analytics.forecasts[resource]} resource={resource} connected={!!analytics.resources[resource]}/></section>)}</div>
      <CampusCsvImport onImported={imported} openRequest={importRequest}/>
      <section id="estate" className="estate-section campus-section" tabIndex={-1} aria-label="Campus estate"><div className="dataset-card"><p className="section-index">Connected files</p><h2>Your building data</h2><div className="uploaded-files">{analytics.datasets.map((dataset) => <article key={dataset.id}><FileSpreadsheet size={20}/><div><b>{dataset.name}</b><p>{dataset.resource.startsWith("energy") ? "Energy" : "Water"} · {dataset.rowCount} readings · {dataset.missingHours} missing hours · {date(dataset.start)} – {date(dataset.end)}</p></div></article>)}</div>{(["energy","water"] as const).map((resource) => {const evaluation = analytics.evaluation[resource];return evaluation && <p key={resource} className="model-evaluation"><b>{resource === "energy" ? "Energy" : "Water"} validation:</b> {evaluation.testHours} held-out hours · {evaluation.wapePercent == null ? "WAPE unavailable for zero totals" : evaluation.wapePercent + "% weighted absolute error"} · MAE {evaluation.mae} {evaluation.unit}. Each test day uses earlier readings only; this does not guarantee future accuracy.</p>;})}</div><BuildingComparison comparisons={analytics.comparisons} selectedBuilding={analytics.selectedBuilding} onSelect={chooseBuilding} busy={loading}/></section>
      <section id="anomaly-details" className="anomaly-section campus-section" tabIndex={-1} aria-label="Detected anomalies"><div className="anomaly-section__head"><div><p className="section-index">Pattern checks</p><h2>Unusual readings</h2></div><span>Same hour on earlier days · score is not a probability</span></div><div className="anomaly-list">{overview.alerts.length ? overview.alerts.map((alert) => <article className="anomaly-item" key={alert.id}><div><b>{alert.title}</b><span>{time(alert.recordedAt)} IST · {alert.building}</span></div><p>{alert.reason}</p><strong>{alert.confidence}/100 pattern score</strong></article>) : <p>{analytics.forecasts.energy || analytics.forecasts.water ? "No unusual readings were detected for resources with enough history." : "Pattern checking needs at least four complete days of hourly readings."}</p>}</div></section>
      <div className="csv-charts">{(["energy","water"] as const).map((resource) => <article className="chart-card" key={resource}><header><div><p className="section-index">Latest complete day</p><h2>{resource === "energy" ? "Energy" : "Water"} across the day</h2></div><span>{overview.summaries[resource].latestDay ?? "No complete day"} · IST</span></header><div className="chart"><div className="legend"><span>{resource === "energy" ? "Energy · kWh" : "Water · kL"}</span></div><div className="chart-plot"><div className="gridlines"/><div className="energy-line">{overview.series[resource].length ? <Spark values={overview.series[resource]} color={resource === "energy" ? "#c8ff4d" : "#4ed2ff"}/> : <p className="chart-empty">Upload a complete day of {resource} readings.</p>}</div></div><div className="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div><footer><p>Complete-day total <b>{format(overview.summaries[resource].latestDayTotal)} {resource === "energy" ? "kWh" : "kL"}</b></p><p>Relative hourly pattern</p></footer></article>)}</div>
      <section id="actions" className="csv-actions campus-section" tabIndex={-1} aria-label="Reading review actions"><p className="section-index">From your findings</p><h2>Recommended reviews</h2><p>Investigate flagged readings before making operational changes. Savings are not estimated.</p>{overview.recommendations.length ? <div className="review-actions">{overview.recommendations.map((action) => <article key={action.id}><div><span>{time(action.recordedAt)} IST</span><h3>{action.title}</h3><p>{action.detail}</p></div><button type="button" onClick={() => void plan(action.id)} disabled={action.status === "planned" || !!planning} aria-label={"Plan " + action.title + " at " + action.recordedAt}>{action.status === "planned" ? <><Check size={16}/>Planned</> : planning === action.id ? "Saving…" : "Add to plan"}</button></article>)}</div> : <p>No review actions yet. They appear when your readings contain unusual usage with sufficient history.</p>}</section>
      <p className="csv-notice" role="status">{notice}</p>
    </main>
  </div></SidebarProvider>;
}
