"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bike, Building2, BusFront,
  Check, CircleAlert, Droplets, Gauge, Leaf, Lightbulb,
  Menu, Route, Sparkles, Trash2, Zap,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar";
import { CampusCsvImport } from "@/components/campus-csv-import";
import { BuildingComparison } from "@/components/building-comparison";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BuildingInfo, BuildingComparisons } from "@/lib/campus-buildings";

const nav = [
  [Gauge, "Pulse", "pulse"], [Building2, "Estate", "estate"], [Zap, "Energy", "energy"],
  [Droplets, "Water", "water"], [Route, "Movement", "movement"], [Trash2, "Circularity", "circularity"],
] as const;
type CampusSection = typeof nav[number][2];


type LiveMetric = { id: string; label: string; value: number | null; unit: string; change_text: string; trend: string; accent: string };
type LiveAction = { id: string; title: string; detail: string; impact: string; tag: string; tone: string; category: string; status: string };
type LiveAlert = { id: string; title: string; detail: string; building: string; severity: string; status?: string; resource?: string; reason?: string; confidence?: number; deltaPercent?: number; recordedAt?: string };
type Forecast = {
  resource: string; building: string; unit: string; horizon: string; method: string;
  historicalDays: number; typicalErrorPercent: number; total: number;
  source: string; timeZone: string; analysisDay: string;
  peak: { recordedAt: string; value: number };
  points: { recordedAt: string; value: number; lower: number; upper: number }[];
};
type LiveOverview = {
  score: number; optimized: boolean; metrics: LiveMetric[];
  series: { energy: number[]; water: number[] };
  alerts: LiveAlert[]; recommendations: LiveAction[];
  mobility: { cleanTrips: number; shuttleTrips: number; bikeRides: number; avoidedCarbon: number };
  analytics?: {
    selectedBuilding: string; buildings: BuildingInfo[]; comparisons: BuildingComparisons;
    resources: {energy: string | null; water: string | null};
    analysisDays: {energy: string | null; water: string | null};
    dataSource: string; forecasts: { energy: Forecast | null; water: Forecast | null }; anomalies: LiveAlert[];
    datasets: {name: string; resource: string; building: string; source: string; rowCount: number; missingHours: number; start: string; end: string}[];
    evaluation: {energy: {testDays: number; testHours: number; startDay: string; endDay: string; mae: number; wapePercent: number | null; unit: string} | null};
  };
};

function Spark({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1) * 1.15;
  const points = data.map((value, index) => `${(index / Math.max(data.length - 1, 1)) * 100},${95 - value / max * 85}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><circle cx="100" cy={95 - data.at(-1)! / max * 85} r="3.2" fill={color} /></svg>;
}

function ForecastLine({ forecast, color }: { forecast: Forecast; color: string }) {
  const values = forecast.points.map((point) => point.value);
  const min = Math.min(...values) * 0.88;
  const max = Math.max(...values) * 1.08;
  const span = Math.max(max - min, 0.01);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${90 - ((value - min) / span) * 80}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ForecastCard({ forecast, label, color }: { forecast: Forecast; label: string; color: string }) {
  const peakTime = new Date(forecast.peak.recordedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: forecast.timeZone });
  const forecastDay = new Date(forecast.points[0].recordedAt).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric",timeZone:forecast.timeZone});
  return <article className="forecast-card">
    <div className="forecast-card__head"><div><span>{forecast.source === "simulated" ? "Simulated data" : "Historical CSV"} · {forecastDay}</span><h3>{label} forecast</h3></div><b>{forecast.historicalDays} day history</b></div>
    <div className="forecast-card__numbers"><strong>{forecast.total.toLocaleString()}</strong><span>{forecast.unit} predicted</span></div>
    <p className="forecast-building">{forecast.building}</p>
    <div className="forecast-card__line"><ForecastLine forecast={forecast} color={color} /></div>
    <div className="forecast-card__foot"><span>Peak {forecast.peak.value} {forecast.unit} at {peakTime} {forecast.timeZone === "Asia/Kolkata" ? "IST" : "UTC"}</span><span>Same-hour median · latest-day median error {forecast.typicalErrorPercent}%</span></div>
  </article>;
}

function Metric({ icon: Icon, label, value, unit, note, color, warning = false }: { icon: typeof Zap; label: string; value: string; unit: string; note: string; color: string; warning?: boolean }) {
  return <article className={`metric metric--${color}`}><div className="metric__top"><span className="metric__icon"><Icon size={18} /></span><span className={warning ? "metric__note warning" : "metric__note"}>{/below|above|lower|improved/.test(note) ? warning ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} /> : null}{note}</span></div><p>{label}</p><div><strong>{value}</strong><span>{unit}</span></div></article>;
}

export default function Home() {
  const period = "Latest complete day";
  const [optimized, setOptimized] = useState(false);
  const [planned, setPlanned] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<CampusSection>("pulse");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<LiveOverview | null>(null);
  const [dataError, setDataError] = useState("");
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const loadOverview = useCallback(async (building = "") => {
    const sequence = ++requestSequence.current;
    setLoading(true); setDataError("");
    try {
      const response = await fetch("/api/campus/overview" + (building ? "?building=" + encodeURIComponent(building) : ""));
      const next = await response.json() as LiveOverview & {error?: string};
      if (!response.ok) throw new Error(next.error || "Building readings are unavailable.");
      if (sequence === requestSequence.current) {
        setOverview(next); setOptimized(next.optimized);
        setNotice(`Showing ${next.analytics?.selectedBuilding}.`);
        if (next.analytics?.selectedBuilding) {
          const url = new URL(window.location.href);
          url.searchParams.set("building", next.analytics.selectedBuilding);
          window.history.replaceState(window.history.state, "", url);
        }
      }
    } catch (error) {
      if (sequence === requestSequence.current) setDataError(error instanceof Error ? error.message : "Building readings are unavailable.");
      throw error;
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, []);
  const selectBuilding = (building: string) => { void loadOverview(building).catch(() => undefined); };
  const selectedBuilding = overview?.analytics?.selectedBuilding ?? "";
  useEffect(() => {
    const syncSection = () => {
      const id = window.location.hash.slice(1);
      const section = nav.find(([, , target]) => target === id);
      if (section || !id) setActiveSection(section?.[2] ?? "pulse");
      if (section) document.getElementById(section[2])?.focus({ preventScroll: true });
    };
    syncSection();
    window.addEventListener("hashchange", syncSection);
    return () => window.removeEventListener("hashchange", syncSection);
  }, []);
  const selectSection = (id: CampusSection) => {
    setActiveSection(id);
    setMenuOpen(false);
    document.getElementById(id)?.focus({ preventScroll: true });
  };
  const score = overview?.score ?? (optimized ? 87 : 82);
  const snapshot = useMemo(() => ({
    campus: overview?.analytics?.selectedBuilding ?? "Loading building",
    period,
    energy: {value: overview?.metrics.find((item) => item.id === "energy")?.value ?? null, unit: overview?.metrics.find((item) => item.id === "energy")?.unit ?? "kWh", source: overview?.analytics?.resources.energy ?? "unavailable"},
    water_kl: overview?.metrics.find((item) => item.id === "water")?.value ?? null,
    carbon_tco2e: overview?.metrics.find((item) => item.id === "carbon")?.value ?? (optimized ? 5.9 : 6.8),
    active_alerts: overview?.alerts.length ?? null,
    sustainability_score: score,
  }), [overview, period, optimized, score]);
  const applyScenario = async () => {
    try {
      const sequence = requestSequence.current;
      const response = await fetch("/api/campus/scenario?building=" + encodeURIComponent(selectedBuilding), { method: "POST" });
      if (!response.ok) throw new Error("Scenario service unavailable");
      const next = await response.json() as LiveOverview;
      if (sequence === requestSequence.current) { setOverview(next); setOptimized(next.optimized); setNotice("Demo efficiency scenario marked active."); }
    } catch { setDataError("The scenario service is temporarily unavailable."); }
  };
  const plan = async (id: string) => {
    try {
      const response = await fetch("/api/campus/recommendations/" + encodeURIComponent(id) + "/plan", { method: "POST" });
      if (!response.ok) throw new Error("Action plan unavailable");
      setPlanned((all) => all.includes(id) ? all : [...all, id]);
      setOverview((current) => current ? { ...current, recommendations: current.recommendations.map((item) => item.id === id ? { ...item, status: "planned" } : item) } : current);
      setNotice("Recommendation added to the action plan.");
    } catch { setDataError("The recommendation could not be saved."); }
  };

  useEffect(() => {
    void loadOverview(new URL(window.location.href).searchParams.get("building") || "").catch(() => undefined);
    return () => { requestSequence.current++; };
  }, [loadOverview]);

  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    void Promise.all([
      context.registerTool({ name: "get_campus_sustainability_snapshot", title: "Get campus sustainability snapshot", description: "Read the metrics currently visible in the campus dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => snapshot }, { signal: controller.signal }),
      context.registerTool({ name: "apply_energy_efficiency_scenario", title: "Apply energy efficiency scenario", description: "Apply the efficiency scenario available from the dashboard.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { applyScenario(); return { status: "applied", projected_energy_reduction_percent: 14.8 }; } }, { signal: controller.signal }),
    ]).catch(() => undefined);
    return () => controller.abort();
  }, [snapshot]);

  const defaultActions = [
    { id: "hvac", icon: Lightbulb, title: "Delay Library HVAC start", copy: "Low-occupancy mornings make a 30-minute delay feasible.", impact: "−1.2 MWh", tone: "lime", label: "highest return" },
    { id: "water", icon: Droplets, title: "Inspect Science Block line", copy: "Night flow is 26% above its expected pattern.", impact: "−38 kL", tone: "blue", label: "review today" },
    { id: "shuttle", icon: BusFront, title: "Add one evening shuttle", copy: "Demand clusters after 17:30 on weekdays.", impact: "−0.4 tCO₂e", tone: "orange", label: "next best move" },
  ];
  const actionIcons = { hvac: Lightbulb, water: Droplets, shuttle: BusFront };
  const actions = overview?.recommendations.map((action) => ({
    ...action,
    copy: action.detail,
    label: action.tag,
    icon: actionIcons[action.id as keyof typeof actionIcons] ?? Lightbulb,
  })) ?? defaultActions;
  const metric = (id: string, fallback: LiveMetric) => overview?.metrics.find((item) => item.id === id) ?? fallback;
  const energyMetric = metric("energy", { id: "energy", label: "Building energy", value: null, unit: "kWh", change_text: "Loading readings", trend: "neutral", accent: "lime" });
  const waterMetric = metric("water", { id: "water", label: "Building water", value: null, unit: "kL", change_text: "Loading readings", trend: "neutral", accent: "blue" });
  const carbonMetric = metric("carbon", { id: "carbon", label: "Carbon", value: 6.8, unit: "tCO₂e", change_text: "Demo · 11.4% lower", trend: "down", accent: "pink" });
  const diversionMetric = metric("diversion", { id: "diversion", label: "Diversion", value: 72, unit: "%", change_text: "Demo · 4.6% improved", trend: "down", accent: "orange" });
  const alerts = overview?.alerts ?? [];
  const displayAlerts = alerts.filter((alert, index) => alerts.findIndex((item) => (item.resource ?? item.id) === (alert.resource ?? alert.id)) === index);
  const energyForecast = overview?.analytics?.forecasts.energy;
  const waterForecast = overview?.analytics?.forecasts.water;
  const energyDataset = overview?.analytics?.datasets.find((item) => item.resource === "energy_hourly_kwh");
  const primaryDataset = energyDataset ?? overview?.analytics?.datasets[0];
  const evaluation = overview?.analytics?.evaluation.energy;
  const reloadReadings = async (building: string) => { await loadOverview(building); };

  return <SidebarProvider defaultOpen>
    <div className="atlas min-h-screen w-full">
      <Sidebar collapsible="icon" className="atlas-sidebar hidden border-0 md:flex">
        <SidebarHeader className="p-4 pt-5"><div className="flex items-center gap-3"><div className="atlas-mark"><Leaf size={19} fill="currentColor" /></div><div className="group-data-[collapsible=icon]:hidden"><b className="text-white">Verdant</b><p>Campus atlas</p></div></div></SidebarHeader>
        <SidebarContent className="mt-7 px-3"><SidebarGroup><SidebarGroupLabel>Navigate</SidebarGroupLabel><SidebarGroupContent><nav aria-label="Campus sections"><SidebarMenu>{nav.map(([Icon, label, id]) => <SidebarMenuItem key={id}><SidebarMenuButton asChild tooltip={label} isActive={activeSection === id}><a href={`#${id}`} aria-current={activeSection === id ? "location" : undefined} onClick={() => selectSection(id)}><Icon size={17} /><span>{label}</span></a></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarGroupContent></SidebarGroup></SidebarContent>
        <SidebarFooter className="p-3"><div className="atlas-side-status group-data-[collapsible=icon]:hidden"><b><i />{overview?.analytics ? `${overview.analytics.buildings.length} buildings available` : "Loading readings"}</b><span>Building-specific readings / demo indicators labelled</span></div></SidebarFooter>
      </Sidebar>
      <main className="atlas-main min-w-0 flex-1">
        <header className="atlas-header"><button className="atlas-menu md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="campus-mobile-navigation"><Menu size={18} /></button><div><p className="eyebrow">{selectedBuilding || "Loading campus"} / building readings</p><h1>Campus pulse</h1></div><div className="atlas-tools"><a className="campus-picker" href="#csv-import"><Building2 size={16} />Data import</a><span className="temp">{primaryDataset ? "CSV" : "DEMO"}</span></div></header>
        <nav id="campus-mobile-navigation" aria-label="Mobile campus sections" className="atlas-mobile md:hidden" hidden={!menuOpen}>{nav.map(([, label, id]) => <a key={id} href={`#${id}`} className={activeSection === id ? "active" : ""} aria-current={activeSection === id ? "location" : undefined} onClick={() => selectSection(id)}>{label}</a>)}</nav>
        <div className="building-toolbar" aria-busy={loading}><div><Building2 size={20}/><label htmlFor="campus-building">Selected building<NativeSelect id="campus-building" value={selectedBuilding} disabled={loading || !overview?.analytics} onChange={(event) => selectBuilding(event.target.value)}>{!overview?.analytics && <NativeSelectOption value="">Loading buildings…</NativeSelectOption>}{overview?.analytics?.buildings.map((building) => <NativeSelectOption key={building.name} value={building.name}>{building.name}{building.isDemo ? " · Demo" : " · CSV"}</NativeSelectOption>)}</NativeSelect></label></div><p role="status">{loading ? "Loading building readings…" : "Forecasts and alerts use only this building."}</p></div>
        {dataError && <p className="building-error" role="alert">{dataError} <button type="button" onClick={() => selectBuilding(selectedBuilding)}>Retry</button></p>}
        <section className="atlas-top campus-section" id="pulse" tabIndex={-1} aria-label="Campus pulse">
          <article className="score-card"><p><i />demo index</p><div className="score-dial" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><span>score</span><strong>{score}</strong><small>/ 100</small></div></div><h2>Sustainability signal</h2><span>Illustrative index and efficiency scenario. Imported energy does not determine this score.</span><footer><small>scenario</small><b>{optimized ? "active" : "baseline"}</b></footer></article>
          <article className="daily-card"><div className="daily-index"><b>01</b><span>Reading insight</span></div><h2>{primaryDataset ? <>Your building.<br /><em>Its own</em> pattern.</> : <>Explore the<br /><em>building</em> pattern.</>}</h2><p>{primaryDataset ? `${primaryDataset.rowCount} hourly CSV readings for ${selectedBuilding}.` : overview ? "Simulated readings for this building." : "Loading readings."} {alerts.length} unusual readings across energy and water. Review each source below.</p><footer><span>Energy test error <b>{evaluation?.wapePercent !== null && evaluation?.wapePercent !== undefined ? `${evaluation.wapePercent}%` : overview ? "Unavailable" : "Loading"}</b></span><button onClick={applyScenario} disabled={optimized || loading}><Sparkles size={16} />{optimized ? "Demo scenario active" : "Try demo scenario"}</button></footer></article>
          <article className="scan-card"><header><b>Field scan</b><span>{String(alerts.length).padStart(2, "0")}</span></header>{displayAlerts.slice(0, 2).map((alert) => <div className="scan-item" key={alert.id}><i className={alert.resource?.includes("water") || alert.id.includes("water") ? "water" : "power"}>{alert.resource?.includes("water") || alert.id.includes("water") ? <Droplets size={17} /> : <Zap size={17} />}</i><p><b>{alert.title}</b><span>{alert.building} · +{alert.deltaPercent ?? "?"}%</span></p><CircleAlert size={17} /></div>)}<button onClick={() => document.getElementById("anomaly-details")?.scrollIntoView({ behavior: "smooth" })}>See anomaly details</button></article>
        </section>
        <div className="atlas-tabs"><b>Latest complete day per resource</b><p>{"Selected building · unavailable resources shown as —"}</p></div>
        <section className="metrics"><Metric icon={Zap} label={energyMetric.label} value={energyMetric.value === null ? "—" : String(energyMetric.value)} unit={energyMetric.unit} note={energyMetric.change_text} color={energyMetric.accent} /><Metric icon={Droplets} label={waterMetric.label} value={waterMetric.value === null ? "—" : String(waterMetric.value)} unit={waterMetric.unit} note={waterMetric.change_text} color={waterMetric.accent} warning={waterMetric.trend === "up"} /><Metric icon={Leaf} label={carbonMetric.label} value={String(carbonMetric.value)} unit={carbonMetric.unit} note={carbonMetric.change_text} color={carbonMetric.accent} /><Metric icon={Trash2} label={diversionMetric.label} value={String(diversionMetric.value)} unit={diversionMetric.unit} note={diversionMetric.change_text} color={diversionMetric.accent} /></section>
        <section className="forecast-section" aria-label="24 hour forecasts">
          <section id="energy" className="campus-section" tabIndex={-1} aria-label="Energy outlook">{energyForecast ? <ForecastCard forecast={energyForecast} label="Energy" color="#c8ff4d" /> : <article className="forecast-card"><h3>{overview ? "Energy forecast unavailable" : "Loading energy forecast"}</h3><p>{overview ? overview.analytics?.resources.energy ? "Provide at least four complete days of hourly energy readings. Gaps are kept unfilled." : `No energy readings connected for ${selectedBuilding}. Import an energy CSV for this building.` : dataError || "Reading the connected energy source."}</p></article>}</section>
          <section id="water" className="campus-section" tabIndex={-1} aria-label="Water outlook">{waterForecast ? <ForecastCard forecast={waterForecast} label="Water" color="#4ed2ff" /> : <article className="forecast-card"><h3>{overview ? "Water forecast unavailable" : "Loading water forecast"}</h3><p>{overview ? overview.analytics?.resources.water ? "Provide at least four complete days of hourly water readings. Gaps are kept unfilled." : `No water readings connected for ${selectedBuilding}. Import a water CSV for this building.` : dataError || "Reading the water source."}</p></article>}</section>
        </section>
        <CampusCsvImport onImported={reloadReadings}/>
        <section id="estate" className="estate-section campus-section" tabIndex={-1} aria-label="Campus estate"><div className="dataset-card"><div><p className="section-index">Estate / connected building</p><h2>{selectedBuilding || "Campus estate"}</h2>{primaryDataset ? <><p><b>{primaryDataset.name}</b> · active {primaryDataset.resource.startsWith("energy") ? "energy" : "water"} source</p><p>{new Date(primaryDataset.start).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})} – {new Date(primaryDataset.end).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata"})} · {primaryDataset.rowCount} hours · {primaryDataset.missingHours} missing hours · IST</p><p>{primaryDataset.source.includes("COMBED") ? <>Hourly kWh estimated from measured power; at least 98.3% of nominal samples in each retained hour. No gap longer than 60 seconds within an hour. <a href="https://combed.github.io/" target="_blank" rel="noreferrer">COMBED / Batra et al.</a></> : "Uploaded hourly consumption. Source attribution has not been verified."}</p></> : <p>{overview ? "This building currently has demo readings only." : "Loading connected building readings."} <a href="#csv-import">Manage CSV readings</a></p>}</div>{evaluation && <div className="dataset-evaluation"><b>{evaluation.wapePercent ?? "—"}%</b><span>weighted absolute forecast error</span><p>{evaluation.testDays} later days / {evaluation.testHours} hours<br/>Mean absolute error: {evaluation.mae} {evaluation.unit}<br/>{evaluation.startDay} – {evaluation.endDay}</p><small>Each test day uses only earlier readings. Error measures this sample, not future accuracy.</small></div>}</div>{overview?.analytics && <BuildingComparison comparisons={overview.analytics.comparisons} selectedBuilding={selectedBuilding} onSelect={selectBuilding} busy={loading}/>}</section>
        <section className="anomaly-section" id="anomaly-details" aria-label="Detected anomalies">
          <div className="anomaly-section__head"><div><p className="section-index">Model findings</p><h2>Unusual readings</h2></div><span>Compared with the same hour on prior days · pattern score is not a probability</span></div>
          <div className="anomaly-list">{alerts.length ? alerts.map((alert) => <article className="anomaly-item" key={alert.id}><div><b>{alert.title}</b><span>{alert.detail}</span></div><p>{alert.reason ?? "Review this reading against its usual pattern."}</p><strong>{alert.confidence ?? "—"}/100 pattern score</strong></article>) : <p>{overview ? "No unusual readings were detected in the latest complete day." : dataError || "Loading building analysis…"}</p>}</div>
        </section>
        <section className="dashboard-grid">
          <article className="chart-card"><header><div><p className="section-index">02 / resource field</p><h2>Energy across the day</h2></div><span>{overview?.analytics?.analysisDays.energy ?? "No complete day"} · {overview?.analytics?.resources.energy === "simulated" ? "UTC" : "IST"}</span></header><div className="chart"><div className="legend"><span><i />{overview?.analytics?.resources.energy === "simulated" ? "Demo energy / kWh" : "CSV energy / kWh"}</span></div><div className="chart-plot"><div className="gridlines" /><div className="energy-line">{overview?.series.energy.length ? <Spark data={overview.series.energy} color="#c8ff4d" /> : <p className="chart-empty">No complete energy day for this building.</p>}</div></div><div className="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></div><footer><p>Latest complete day · total <b>{energyMetric.value ?? "—"} {energyMetric.unit}</b></p><p>Scale: relative hourly draw</p></footer></article>
          <article id="movement" className="travel-card campus-section" tabIndex={-1} aria-label="Campus movement"><header><div><p className="section-index">03 / movement · demo</p><h2>Low-carbon travel</h2></div><Bike size={20} /></header><div className="travel-ring"><div><strong>{overview?.mobility.cleanTrips ?? 68}%</strong><span>clean trips</span></div></div><div className="travel-list"><p><i className="mint" />Shuttle <b>{overview?.mobility.shuttleTrips ?? 1286}</b></p><p><i className="cyan" />Bike <b>{overview?.mobility.bikeRides ?? 438}</b></p><p><i className="yellow" />Avoided <b>{overview?.mobility.avoidedCarbon ?? 2.1}t</b></p></div><footer><Activity size={16} />Illustrative trips and emissions.</footer></article>
        </section>
        <section id="circularity" className="circularity-card campus-section" tabIndex={-1} aria-labelledby="circularity-title"><div><p className="section-index">Circularity / demo</p><h2 id="circularity-title">Waste diversion</h2><p>Illustrative share of waste kept out of landfill. No real waste readings are connected yet.</p></div><div className="circularity-value"><Trash2 size={24} aria-hidden="true"/><strong>{diversionMetric.value}<span>{diversionMetric.unit}</span></strong><span>{diversionMetric.change_text}</span></div></section>
        <section className="atlas-bottom">
          <article className="action-board"><header><div><p className="section-index">04 / action queue · demo</p><h2>Illustrative campus moves</h2></div><span>Demo savings estimates</span></header><div className="actions">{actions.map((action, index) => { const Icon = action.icon; const done = planned.includes(action.id) || ("status" in action && (action.status === "planned" || action.status === "active")); return <div key={action.id} className={`action action--${action.tone}`}><small>0{index + 1}</small><i><Icon size={18} /></i><div><header><h3 className={done ? "done" : ""}>{action.title}</h3><span>{action.label}</span></header><p>{action.copy}</p></div><b>{action.impact}<small>/ month</small></b><button disabled={done} className={done ? "done" : ""} onClick={() => plan(action.id)} aria-label={`Plan ${action.title}`}>{done ? <Check size={16} /> : "+"}</button></div>; })}</div></article>
          <article className="carbon-card"><p className="section-index">05 / monthly target</p><div><span>carbon</span><strong>{carbonMetric.value}</strong><em>{carbonMetric.unit}</em></div><section>{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</section><p>At today’s pace, the campus closes the month <b>{carbonMetric.change_text}</b> its carbon plan.</p></article>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  </SidebarProvider>;
}
