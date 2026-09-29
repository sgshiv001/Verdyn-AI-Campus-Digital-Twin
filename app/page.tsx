"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Bike, Building2, BusFront,
  Check, ChevronDown, CircleAlert, Droplets, Gauge, Leaf, Lightbulb,
  Menu, Route, Sparkles, Trash2, Zap,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const nav = [
  [Gauge, "Pulse"], [Building2, "Estate"], [Zap, "Energy"],
  [Droplets, "Water"], [Route, "Movement"], [Trash2, "Circularity"],
] as const;
const energy = [42, 49, 47, 55, 51, 68, 63, 73, 67, 78, 75, 88];
const water = [34, 39, 37, 46, 42, 53, 48, 57, 54, 62, 58, 66];

type LiveMetric = { id: string; label: string; value: number; unit: string; change_text: string; trend: string; accent: string };
type LiveAction = { id: string; title: string; detail: string; impact: string; tag: string; tone: string; category: string; status: string };
type LiveAlert = { id: string; title: string; detail: string; building: string; severity: string; status?: string; resource?: string; reason?: string; confidence?: number; deltaPercent?: number; recordedAt?: string };
type Forecast = {
  resource: string; building: string; unit: string; horizon: string; method: string;
  historicalDays: number; typicalErrorPercent: number; total: number;
  peak: { recordedAt: string; value: number };
  points: { recordedAt: string; value: number; lower: number; upper: number }[];
};
type LiveOverview = {
  score: number; optimized: boolean; metrics: LiveMetric[];
  series: { energy: number[]; water: number[] };
  alerts: LiveAlert[]; recommendations: LiveAction[];
  mobility: { cleanTrips: number; shuttleTrips: number; bikeRides: number; avoidedCarbon: number };
  analytics?: { dataSource: string; forecasts: { energy: Forecast | null; water: Forecast | null }; anomalies: LiveAlert[] };
};

function Spark({ data, color }: { data: number[]; color: string }) {
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 100},${100 - value}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><circle cx="100" cy={100 - data.at(-1)!} r="3.2" fill={color} /></svg>;
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
  const peakTime = new Date(forecast.peak.recordedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return <article className="forecast-card">
    <div className="forecast-card__head"><div><span>Next 24 hours · simulated data</span><h3>{label} forecast</h3></div><b>{forecast.historicalDays} day history</b></div>
    <div className="forecast-card__numbers"><strong>{forecast.total.toLocaleString()}</strong><span>{forecast.unit} predicted</span></div>
    <div className="forecast-card__line"><ForecastLine forecast={forecast} color={color} /></div>
    <div className="forecast-card__foot"><span>Peak {forecast.peak.value} {forecast.unit} at {peakTime} UTC</span><span>Same-hour median · typical error {forecast.typicalErrorPercent}%</span></div>
  </article>;
}

function Metric({ icon: Icon, label, value, unit, note, color, warning = false }: { icon: typeof Zap; label: string; value: string; unit: string; note: string; color: string; warning?: boolean }) {
  return <article className={`metric metric--${color}`}><div className="metric__top"><span className="metric__icon"><Icon size={18} /></span><span className={warning ? "metric__note warning" : "metric__note"}>{warning ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{note}</span></div><p>{label}</p><div><strong>{value}</strong><span>{unit}</span></div></article>;
}

export default function Home() {
  const [period, setPeriod] = useState("Today");
  const [optimized, setOptimized] = useState(false);
  const [planned, setPlanned] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<LiveOverview | null>(null);
  const [dataError, setDataError] = useState("");
  const score = overview?.score ?? (optimized ? 87 : 82);
  const snapshot = useMemo(() => ({
    campus: "Greenfield Campus",
    period,
    energy_mwh: overview?.metrics.find((item) => item.id === "energy")?.value ?? (optimized ? 16.9 : 18.4),
    water_kl: overview?.metrics.find((item) => item.id === "water")?.value ?? (optimized ? 398 : 412),
    carbon_tco2e: overview?.metrics.find((item) => item.id === "carbon")?.value ?? (optimized ? 5.9 : 6.8),
    active_alerts: overview?.alerts.length ?? 2,
    sustainability_score: score,
  }), [overview, period, optimized, score]);
  const applyScenario = async () => {
    try {
      const response = await fetch("/api/campus/scenario", { method: "POST" });
      if (!response.ok) throw new Error("Scenario service unavailable");
      const next = await response.json() as LiveOverview;
      setOverview(next); setOptimized(next.optimized); setNotice("Efficiency scenario marked active.");
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
    let active = true;
    setDataError("");
    void fetch("/api/campus/overview?period=" + encodeURIComponent(period))
      .then(async (response) => {
        if (!response.ok) throw new Error("Campus data unavailable");
        return response.json() as Promise<LiveOverview>;
      })
      .then((next) => { if (active) { setOverview(next); setOptimized(next.optimized); } })
      .catch(() => { if (active) setDataError("Campus data unavailable; sample values shown."); });
    return () => { active = false; };
  }, [period]);

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
  const energyMetric = metric("energy", { id: "energy", label: "Energy", value: 18.4, unit: "MWh", change_text: "8.2% below plan", trend: "down", accent: "lime" });
  const waterMetric = metric("water", { id: "water", label: "Water", value: 412, unit: "kL", change_text: "3.1% above plan", trend: "up", accent: "blue" });
  const carbonMetric = metric("carbon", { id: "carbon", label: "Carbon", value: 6.8, unit: "tCO₂e", change_text: "11.4% lower", trend: "down", accent: "pink" });
  const diversionMetric = metric("diversion", { id: "diversion", label: "Diversion", value: 72, unit: "%", change_text: "4.6% improved", trend: "down", accent: "orange" });
  const alerts = overview?.alerts ?? [
    { id: "water-flow", title: "Water flow anomaly", detail: "Science Block · elevated", building: "Science Block", severity: "high", status: "open" },
    { id: "peak-demand", title: "Peak demand", detail: "Admin Block · 14:30", building: "Admin Block", severity: "medium", status: "open" },
  ];
  const displayAlerts = alerts.filter((alert, index) => alerts.findIndex((item) => (item.resource ?? item.id) === (alert.resource ?? alert.id)) === index);
  const energyForecast = overview?.analytics?.forecasts.energy;
  const waterForecast = overview?.analytics?.forecasts.water;

  return <SidebarProvider defaultOpen>
    <div className="atlas min-h-screen w-full">
      <Sidebar collapsible="icon" className="atlas-sidebar hidden border-0 md:flex">
        <SidebarHeader className="p-4 pt-5"><div className="flex items-center gap-3"><div className="atlas-mark"><Leaf size={19} fill="currentColor" /></div><div className="group-data-[collapsible=icon]:hidden"><b className="text-white">Verdant</b><p>Campus atlas</p></div></div></SidebarHeader>
        <SidebarContent className="mt-7 px-3"><SidebarGroup><SidebarGroupLabel>Navigate</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{nav.map(([Icon, label], index) => <SidebarMenuItem key={label}><SidebarMenuButton tooltip={label} isActive={index === 0}><Icon size={17} /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
        <SidebarFooter className="p-3"><div className="atlas-side-status group-data-[collapsible=icon]:hidden"><b><i />Demo data connected</b><span>Hourly readings stored on site</span></div></SidebarFooter>
      </Sidebar>
      <main className="atlas-main min-w-0 flex-1">
        <header className="atlas-header"><button className="atlas-menu md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div><p className="eyebrow">Greenfield Campus / simulated readings</p><h1>Campus pulse</h1></div><div className="atlas-tools"><button className="campus-picker"><Building2 size={16} />Main campus<ChevronDown size={14} /></button><span className="temp">DEMO</span></div></header>
        {menuOpen && <nav className="atlas-mobile md:hidden">{nav.map(([, label], index) => <button key={label} className={index === 0 ? "active" : ""}>{label}</button>)}</nav>}
        <section className="atlas-top">
          <article className="score-card"><p><i />demo index</p><div className="score-dial" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><span>score</span><strong>{score}</strong><small>/ 100</small></div></div><h2>Sustainability signal</h2><span>{optimized ? "Efficiency scenario is active in the demo." : "Campus measures are tracking below their monthly energy plan."}</span><footer><small>scenario</small><b>{optimized ? "active" : "baseline"}</b></footer></article>
          <article className="daily-card"><div className="daily-index"><b>01</b><span>Reading insight</span></div><h2>Demand is easing.<br /><em>Water</em> wants attention.</h2><p>{alerts.length} unusual hourly readings were found against the previous days at the same hour. Review the measured differences below.</p><footer><span>Historical fit <b>{waterForecast ? `${waterForecast.typicalErrorPercent}% error` : "Loading"}</b></span><button onClick={applyScenario} disabled={optimized}><Sparkles size={16} />{optimized ? "Scenario active" : "Test efficiency move"}</button></footer></article>
          <article className="scan-card"><header><b>Field scan</b><span>{String(alerts.length).padStart(2, "0")}</span></header>{displayAlerts.slice(0, 2).map((alert) => <div className="scan-item" key={alert.id}><i className={alert.resource?.includes("water") || alert.id.includes("water") ? "water" : "power"}>{alert.resource?.includes("water") || alert.id.includes("water") ? <Droplets size={17} /> : <Zap size={17} />}</i><p><b>{alert.title}</b><span>{alert.building} · +{alert.deltaPercent ?? "?"}%</span></p><CircleAlert size={17} /></div>)}<button onClick={() => document.getElementById("anomaly-details")?.scrollIntoView({ behavior: "smooth" })}>See anomaly details</button></article>
        </section>
        <Tabs defaultValue="Today" value={period} onValueChange={setPeriod} className="atlas-tabs"><TabsList variant="line">{["Today", "This week", "This month"].map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList><p><i />{dataError || "Simulated campus data"}</p></Tabs>
        <section className="metrics"><Metric icon={Zap} label={energyMetric.label} value={String(energyMetric.value)} unit={energyMetric.unit} note={energyMetric.change_text} color={energyMetric.accent} /><Metric icon={Droplets} label={waterMetric.label} value={String(waterMetric.value)} unit={waterMetric.unit} note={waterMetric.change_text} color={waterMetric.accent} warning={waterMetric.trend === "up"} /><Metric icon={Leaf} label={carbonMetric.label} value={String(carbonMetric.value)} unit={carbonMetric.unit} note={carbonMetric.change_text} color={carbonMetric.accent} /><Metric icon={Trash2} label={diversionMetric.label} value={String(diversionMetric.value)} unit={diversionMetric.unit} note={diversionMetric.change_text} color={diversionMetric.accent} /></section>
        <section className="forecast-section" aria-label="24 hour forecasts">
          {energyForecast && <ForecastCard forecast={energyForecast} label="Energy" color="#c8ff4d" />}
          {waterForecast && <ForecastCard forecast={waterForecast} label="Water" color="#4ed2ff" />}
        </section>
        <section className="anomaly-section" id="anomaly-details" aria-label="Detected anomalies">
          <div className="anomaly-section__head"><div><p className="section-index">Model findings</p><h2>Unusual readings</h2></div><span>Compared with the same hour on prior days · pattern score is not a probability</span></div>
          <div className="anomaly-list">{alerts.length ? alerts.map((alert) => <article className="anomaly-item" key={alert.id}><div><b>{alert.title}</b><span>{alert.detail}</span></div><p>{alert.reason ?? "Review this reading against its usual pattern."}</p><strong>{alert.confidence ?? "—"}/100 pattern score</strong></article>) : <p>No unusual readings were detected in the latest complete day.</p>}</div>
        </section>
        <section className="dashboard-grid">
          <article className="chart-card"><header><div><p className="section-index">02 / resource field</p><h2>Demand across the day</h2></div><span>Measured versus expected draw</span></header><div className="chart"><div className="legend"><span><i />Energy</span><span><i />Water</span></div><div className="chart-plot"><div className="gridlines" /><div className="energy-line"><b>{energyMetric.value} {energyMetric.unit}</b><Spark data={overview?.series.energy ?? energy} color="#c8ff4d" /></div><div className="water-line"><b>{waterMetric.value} {waterMetric.unit}</b><Spark data={overview?.series.water ?? water} color="#4ed2ff" /></div></div><div className="axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span></div></div><footer><p><b>{energyMetric.change_text}</b> electricity against plan</p><p>Next review <b>14:30</b></p></footer></article>
          <article className="travel-card"><header><div><p className="section-index">03 / movement</p><h2>Low-carbon travel</h2></div><Bike size={20} /></header><div className="travel-ring"><div><strong>{overview?.mobility.cleanTrips ?? 68}%</strong><span>clean trips</span></div></div><div className="travel-list"><p><i className="mint" />Shuttle <b>{overview?.mobility.shuttleTrips ?? 1286}</b></p><p><i className="cyan" />Bike <b>{overview?.mobility.bikeRides ?? 438}</b></p><p><i className="yellow" />Avoided <b>{overview?.mobility.avoidedCarbon ?? 2.1}t</b></p></div><footer><Activity size={16} />Evening shuttle demand rises after <b>17:30</b>.</footer></article>
        </section>
        <section className="atlas-bottom">
          <article className="action-board"><header><div><p className="section-index">04 / action queue</p><h2>Highest-value moves</h2></div><span>Ranked by estimated impact</span></header><div className="actions">{actions.map((action, index) => { const Icon = action.icon; const done = planned.includes(action.id) || ("status" in action && (action.status === "planned" || action.status === "active")); return <div key={action.id} className={`action action--${action.tone}`}><small>0{index + 1}</small><i><Icon size={18} /></i><div><header><h3 className={done ? "done" : ""}>{action.title}</h3><span>{action.label}</span></header><p>{action.copy}</p></div><b>{action.impact}<small>/ month</small></b><button disabled={done} className={done ? "done" : ""} onClick={() => plan(action.id)} aria-label={`Plan ${action.title}`}>{done ? <Check size={16} /> : "+"}</button></div>; })}</div></article>
          <article className="carbon-card"><p className="section-index">05 / monthly target</p><div><span>carbon</span><strong>{carbonMetric.value}</strong><em>{carbonMetric.unit}</em></div><section>{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</section><p>At today’s pace, the campus closes the month <b>{carbonMetric.change_text}</b> its carbon plan.</p></article>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  </SidebarProvider>;
}
