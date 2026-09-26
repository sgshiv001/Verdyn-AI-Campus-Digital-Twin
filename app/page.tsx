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

function Spark({ data, color }: { data: number[]; color: string }) {
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 100},${100 - value}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><circle cx="100" cy={100 - data.at(-1)!} r="3.2" fill={color} /></svg>;
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
  const score = optimized ? 87 : 82;
  const snapshot = useMemo(() => ({ campus: "Greenfield Campus", period, energy_mwh: optimized ? 16.9 : 18.4, water_kl: optimized ? 398 : 412, carbon_tco2e: optimized ? 5.9 : 6.8, active_alerts: 2, sustainability_score: score }), [period, optimized, score]);
  const applyScenario = () => { setOptimized(true); setNotice("Efficiency scenario applied. Forecast updated."); };
  const plan = (id: string) => { setPlanned((all) => all.includes(id) ? all : [...all, id]); setNotice("Recommendation added to the action plan."); };

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

  const actions = [
    { id: "hvac", icon: Lightbulb, title: "Delay Library HVAC start", copy: "Low-occupancy mornings make a 30-minute delay feasible.", impact: "−1.2 MWh", tone: "lime", label: "highest return" },
    { id: "water", icon: Droplets, title: "Inspect Science Block line", copy: "Night flow is 26% above its expected pattern.", impact: "−38 kL", tone: "blue", label: "review today" },
    { id: "shuttle", icon: BusFront, title: "Add one evening shuttle", copy: "Demand clusters after 17:30 on weekdays.", impact: "−0.4 tCO₂e", tone: "orange", label: "next best move" },
  ];

  return <SidebarProvider defaultOpen>
    <div className="atlas min-h-screen w-full">
      <Sidebar collapsible="icon" className="atlas-sidebar hidden border-0 md:flex">
        <SidebarHeader className="p-4 pt-5"><div className="flex items-center gap-3"><div className="atlas-mark"><Leaf size={19} fill="currentColor" /></div><div className="group-data-[collapsible=icon]:hidden"><b className="text-white">Verdant</b><p>Campus atlas</p></div></div></SidebarHeader>
        <SidebarContent className="mt-7 px-3"><SidebarGroup><SidebarGroupLabel>Navigate</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{nav.map(([Icon, label], index) => <SidebarMenuItem key={label}><SidebarMenuButton tooltip={label} isActive={index === 0}><Icon size={17} /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
        <SidebarFooter className="p-3"><div className="atlas-side-status group-data-[collapsible=icon]:hidden"><b><i />Model synced</b><span>Last refreshed a moment ago</span></div></SidebarFooter>
      </Sidebar>
      <main className="atlas-main min-w-0 flex-1">
        <header className="atlas-header"><button className="atlas-menu md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation"><Menu size={18} /></button><div><p className="eyebrow">Greenfield Campus / 26 Sept 2026</p><h1>Campus pulse</h1></div><div className="atlas-tools"><button className="campus-picker"><Building2 size={16} />Main campus<ChevronDown size={14} /></button><span className="temp">28°<small>clear</small></span></div></header>
        {menuOpen && <nav className="atlas-mobile md:hidden">{nav.map(([, label], index) => <button key={label} className={index === 0 ? "active" : ""}>{label}</button>)}</nav>}
        <section className="atlas-top">
          <article className="score-card"><p><i />live index</p><div className="score-dial" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><span>score</span><strong>{score}</strong><small>/ 100</small></div></div><h2>Sustainability signal</h2><span>{optimized ? "Your planned intervention lifts tomorrow’s outlook." : "The campus is operating ahead of its monthly path."}</span><footer><small>benchmark</small><b>top 12%</b></footer></article>
          <article className="daily-card"><div className="daily-index"><b>01</b><span>Today’s read</span></div><h2>Demand is easing.<br /><em>Water</em> wants attention.</h2><p>Energy use is settling after the morning peak. Two patterns are out of range and should be reviewed before tomorrow.</p><footer><span>Forecast confidence <b>94%</b></span><button onClick={applyScenario} disabled={optimized}><Sparkles size={16} />{optimized ? "Scenario active" : "Test efficiency move"}</button></footer></article>
          <article className="scan-card"><header><b>Field scan</b><span>02</span></header><div className="scan-item"><i className="water"><Droplets size={17} /></i><p><b>Water flow</b><span>Science Block · elevated</span></p><CircleAlert size={17} /></div><div className="scan-item"><i className="power"><Zap size={17} /></i><p><b>Peak demand</b><span>Admin Block · 14:30</span></p><CircleAlert size={17} /></div><button>Open anomalies <ArrowUpRight size={15} /></button></article>
        </section>
        <Tabs defaultValue="Today" value={period} onValueChange={setPeriod} className="atlas-tabs"><TabsList variant="line">{["Today", "This week", "This month"].map((item) => <TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}</TabsList><p><i />Digital twin is live</p></Tabs>
        <section className="metrics"><Metric icon={Zap} label="Energy" value="18.4" unit="MWh" note="8.2% below plan" color="lime" /><Metric icon={Droplets} label="Water" value="412" unit="kL" note="3.1% above plan" color="blue" warning /><Metric icon={Leaf} label="Carbon" value="6.8" unit="tCO₂e" note="11.4% lower" color="pink" /><Metric icon={Trash2} label="Diversion" value="72" unit="%" note="4.6% improved" color="orange" /></section>
        <section className="dashboard-grid">
          <article className="chart-card"><header><div><p className="section-index">02 / resource field</p><h2>Demand across the day</h2></div><span>Measured versus expected draw</span></header><div className="chart"><div className="legend"><span><i />Energy</span><span><i />Water</span></div><div className="chart-plot"><div className="gridlines" /><div className="energy-line"><b>18.4 MWh</b><Spark data={energy} color="#c8ff4d" /></div><div className="water-line"><b>412 kL</b><Spark data={water} color="#4ed2ff" /></div></div><div className="axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span></div></div><footer><p><b>−8.2%</b> electricity against plan</p><p>Next review <b>14:30</b></p></footer></article>
          <article className="travel-card"><header><div><p className="section-index">03 / movement</p><h2>Low-carbon travel</h2></div><Bike size={20} /></header><div className="travel-ring"><div><strong>68%</strong><span>clean trips</span></div></div><div className="travel-list"><p><i className="mint" />Shuttle <b>1,286</b></p><p><i className="cyan" />Bike <b>438</b></p><p><i className="yellow" />Avoided <b>2.1t</b></p></div><footer><Activity size={16} />Evening shuttle demand rises after <b>17:30</b>.</footer></article>
        </section>
        <section className="atlas-bottom">
          <article className="action-board"><header><div><p className="section-index">04 / action queue</p><h2>Highest-value moves</h2></div><span>AI-ranked today</span></header><div className="actions">{actions.map((action, index) => { const Icon = action.icon; const done = planned.includes(action.id); return <div key={action.id} className={`action action--${action.tone}`}><small>0{index + 1}</small><i><Icon size={18} /></i><div><header><h3 className={done ? "done" : ""}>{action.title}</h3><span>{action.label}</span></header><p>{action.copy}</p></div><b>{action.impact}<small>/ month</small></b><button className={done ? "done" : ""} onClick={() => plan(action.id)} aria-label={`Plan ${action.title}`}>{done ? <Check size={16} /> : "+"}</button></div>; })}</div></article>
          <article className="carbon-card"><p className="section-index">05 / monthly target</p><div><span>carbon</span><strong>6.8</strong><em>tCO₂e</em></div><section>{Array.from({ length: 10 }, (_, index) => <i key={index} />)}</section><p>At today’s pace, the campus closes the month <b>11.4% below</b> its carbon plan.</p></article>
        </section>
        <p className="sr-only" aria-live="polite">{notice}</p>
      </main>
    </div>
  </SidebarProvider>;
}
