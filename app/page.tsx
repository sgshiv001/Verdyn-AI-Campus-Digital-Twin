"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  Building2,
  BusFront,
  ChevronDown,
  CircleCheck,
  Droplets,
  Gauge,
  Leaf,
  Lightbulb,
  Menu,
  MoreHorizontal,
  Route,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const energySeries = [54, 61, 58, 66, 64, 74, 71, 78, 76, 83, 79, 88];
const waterSeries = [42, 47, 45, 53, 50, 57, 54, 61, 58, 65, 62, 70];
const navItems = [
  { label: "Overview", icon: Gauge, active: true },
  { label: "Buildings", icon: Building2 },
  { label: "Energy", icon: Zap },
  { label: "Water", icon: Droplets },
  { label: "Mobility", icon: Route },
  { label: "Waste", icon: Trash2 },
];

type Metric = {
  label: string;
  value: string;
  unit: string;
  change: string;
  trend: "up" | "down";
  icon: typeof Zap;
  tone: "mint" | "blue" | "amber" | "violet";
};

const metrics: Metric[] = [
  { label: "Energy use", value: "18.4", unit: "MWh", change: "8.2% below baseline", trend: "down", icon: Zap, tone: "mint" },
  { label: "Water use", value: "412", unit: "kL", change: "3.1% above baseline", trend: "up", icon: Droplets, tone: "blue" },
  { label: "Carbon emitted", value: "6.8", unit: "tCO₂e", change: "11.4% lower this month", trend: "down", icon: Leaf, tone: "violet" },
  { label: "Waste diverted", value: "72", unit: "%", change: "4.6% improvement", trend: "down", icon: Trash2, tone: "amber" },
];

function LineChart({ data, color, fill }: { data: number[]; color: string; fill: string }) {
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 100},${100 - value}`).join(" ");
  const areaPoints = `0,100 ${points} 100,100`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
      <defs><linearGradient id={fill} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={areaPoints} fill={`url(#${fill})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="100" cy={100 - data[data.length - 1]} r="2.4" fill={color} />
    </svg>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const trendIsGood = metric.trend === "down";
  return (
    <article className="metric-card rounded-[1.25rem] border border-white/[.08] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`metric-icon ${metric.tone}`}><Icon size={18} strokeWidth={2} /></div>
        <span className={`metric-change ${trendIsGood ? "good" : "watch"}`}>
          {trendIsGood ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{metric.change}
        </span>
      </div>
      <p className="mt-5 text-[.78rem] font-medium tracking-[.02em] text-[#9fb4b4]">{metric.label}</p>
      <div className="mt-1 flex items-baseline gap-2"><strong className="text-[1.72rem] font-semibold tracking-[-.05em] text-white">{metric.value}</strong><span className="text-sm text-[#89a0a0]">{metric.unit}</span></div>
    </article>
  );
}

export default function Home() {
  const [period, setPeriod] = useState("Today");
  const [scenario, setScenario] = useState<"baseline" | "optimized">("baseline");
  const [completed, setCompleted] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const savings = scenario === "optimized" ? 14.8 : 8.2;
  const snapshot = useMemo(() => ({
    campus: "Greenfield Campus", period,
    energy_mwh: scenario === "optimized" ? 16.9 : 18.4,
    water_kl: scenario === "optimized" ? 398 : 412,
    carbon_tco2e: scenario === "optimized" ? 5.9 : 6.8,
    active_alerts: 2, sustainability_score: scenario === "optimized" ? 87 : 82,
  }), [period, scenario]);

  function applyScenario() {
    setScenario("optimized");
    setNotice("Efficiency scenario applied — projected savings updated.");
  }
  function completeRecommendation(id: string) {
    setCompleted((current) => current.includes(id) ? current : [...current, id]);
    setNotice("Recommendation marked as planned.");
  }

  useEffect(() => {
    const context = (document as unknown as {
      modelContext?: { registerTool?: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void> };
    }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool?.({
        name: "get_campus_sustainability_snapshot",
        title: "Get campus sustainability snapshot",
        description: "Read the currently visible campus sustainability metrics and active alert count.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => snapshot,
      }, { signal: lifecycle.signal });
      await context.registerTool?.({
        name: "apply_energy_efficiency_scenario",
        title: "Apply energy efficiency scenario",
        description: "Apply the same campus energy-efficiency scenario available from the dashboard, updating projected savings.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => { applyScenario(); return { status: "applied", projected_energy_reduction_percent: 14.8 }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [snapshot]);

  const recommendations = [
    { id: "hvac", icon: Lightbulb, title: "Shift Library HVAC start time", detail: "Start 30 minutes later during low-occupancy hours.", impact: "1.2 MWh / month", level: "High impact", className: "mint" },
    { id: "water", icon: Droplets, title: "Inspect Science Block water line", detail: "Night flow is 26% above its normal pattern.", impact: "38 kL / month", level: "Needs review", className: "blue" },
    { id: "mobility", icon: BusFront, title: "Add one evening shuttle run", detail: "Demand is clustered after 5:30 PM on weekdays.", impact: "0.4 tCO₂e / month", level: "Medium impact", className: "violet" },
  ];

  return (
    <SidebarProvider defaultOpen>
      <div className="campus-shell min-h-screen w-full bg-[#081516] text-white">
        <Sidebar collapsible="icon" className="hidden border-r border-white/[.08] bg-[#0a1a1b] md:flex">
          <SidebarHeader className="px-4 pt-5">
            <div className="flex items-center gap-3 px-1"><div className="brand-mark"><Leaf size={18} fill="currentColor" /></div><div className="group-data-[collapsible=icon]:hidden"><p className="text-sm font-semibold tracking-[-.02em] text-white">CampusOS</p><p className="text-[.66rem] uppercase tracking-[.14em] text-[#79a19c]">Sustainability</p></div></div>
          </SidebarHeader>
          <SidebarContent className="mt-6 px-3">
            <SidebarGroup>
              <SidebarGroupLabel className="px-3 text-[.65rem] uppercase tracking-[.16em] text-[#668382]">Workspace</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu>{navItems.map((item) => { const Icon = item.icon; return <SidebarMenuItem key={item.label}><SidebarMenuButton isActive={item.active} tooltip={item.label} className="h-10 rounded-xl text-[#a4b8b7] hover:bg-white/[.06] hover:text-white data-[active=true]:bg-[#163f3b] data-[active=true]:text-[#a7f2c4]"><Icon size={17} /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="p-3"><div className="rounded-xl border border-[#22403d] bg-[#102725] p-3 group-data-[collapsible=icon]:hidden"><p className="text-xs font-medium text-[#b7d7d1]">Live data simulation</p><p className="mt-1 text-[.7rem] leading-4 text-[#789894]">Connect meters and sensors when ready.</p></div></SidebarFooter>
        </Sidebar>

        <main className="min-w-0 flex-1 px-4 pb-8 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          <header className="mb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><button onClick={() => setMobileNav((open) => !open)} className="grid size-10 place-items-center rounded-xl border border-white/[.12] bg-white/[.04] text-[#bbd1ce] md:hidden" aria-label="Toggle navigation"><Menu size={18} /></button><div><div className="flex items-center gap-2 text-xs text-[#85a19e]"><span className="live-dot" />Live digital twin <span className="text-[#53706e]">•</span> Updated just now</div><h1 className="mt-1 text-[1.48rem] font-semibold tracking-[-.045em] text-white sm:text-[1.75rem]">Campus overview</h1></div></div>
            <div className="flex items-center gap-2"><button className="hidden items-center gap-2 rounded-xl border border-white/[.10] bg-white/[.04] px-3 py-2 text-sm text-[#c3d2d0] sm:flex"><Building2 size={16} /> Greenfield <ChevronDown size={14} /></button><button className="grid size-10 place-items-center rounded-xl border border-white/[.1] bg-white/[.04] text-[#b5c6c4]" aria-label="More options"><MoreHorizontal size={19} /></button></div>
          </header>

          {mobileNav && <nav className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-white/[.08] bg-[#0d2021] p-2 md:hidden">{navItems.map((item) => <button key={item.label} className={`rounded-xl px-2 py-2 text-xs ${item.active ? "bg-[#173f3c] text-[#a7f2c4]" : "text-[#9bb1ae]"}`}>{item.label}</button>)}</nav>}

          <section className="hero-panel relative overflow-hidden rounded-[1.5rem] border border-[#1e4a45] px-5 py-6 sm:px-7 sm:py-7">
            <div className="hero-orb" />
            <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
              <div className="max-w-xl"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#90d7b4]">Daily pulse</p><h2 className="mt-2 text-[1.65rem] font-semibold tracking-[-.055em] text-white sm:text-[2.1rem]">Operations are <span className="text-[#8ff0bd]">{savings}%</span> more efficient than baseline.</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#a1c3bd]">Energy is trending down. Two water-flow patterns need attention before tomorrow morning.</p></div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/[.1] bg-[#0c2928]/70 p-3 backdrop-blur"><div className="score-ring"><strong>{snapshot.sustainability_score}</strong><span>/100</span></div><div><p className="text-sm font-medium text-white">Sustainability score</p><p className="mt-0.5 text-xs text-[#8cb2aa]">Top 12% of similar campuses</p></div></div>
            </div>
          </section>

          <Tabs defaultValue="Today" value={period} onValueChange={setPeriod} className="mt-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <TabsList variant="line" className="h-auto w-full justify-start gap-4 overflow-x-auto border-b border-white/[.1] p-0 sm:w-auto">{["Today", "This week", "This month"].map((item) => <TabsTrigger key={item} value={item} className="h-9 flex-none rounded-none px-1 pb-3 text-sm text-[#8ca3a0] data-[state=active]:text-[#9df4c3] after:bg-[#9df4c3]">{item}</TabsTrigger>)}</TabsList>
              <button onClick={applyScenario} disabled={scenario === "optimized"} className="scenario-button inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium disabled:cursor-default disabled:opacity-70"><Sparkles size={16} />{scenario === "optimized" ? "Scenario applied" : "Run efficiency scenario"}</button>
            </div>
          </Tabs>

          <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)]">
            <article className="panel rounded-[1.35rem] border border-white/[.08] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">Resource demand</p><p className="mt-1 text-xs text-[#859d9a]">Actual use compared with expected campus demand</p></div><div className="flex items-center gap-3 text-xs text-[#9ab0ad]"><span className="flex items-center gap-1.5"><i className="legend energy" />Energy</span><span className="flex items-center gap-1.5"><i className="legend water" />Water</span></div></div>
              <div className="mt-5 grid h-48 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-white/[.08] pb-3 sm:h-56"><div className="relative"><div className="chart-grid" /><LineChart data={energySeries} color="#77e6a8" fill="energy-fill" /><span className="absolute left-0 top-1 rounded-full bg-[#173d32] px-2 py-1 text-[.65rem] font-medium text-[#a4f2c3]">18.4 MWh</span></div><div className="relative"><div className="chart-grid" /><LineChart data={waterSeries} color="#6ec9ff" fill="water-fill" /><span className="absolute left-0 top-1 rounded-full bg-[#12384a] px-2 py-1 text-[.65rem] font-medium text-[#9cddff]">412 kL</span></div></div>
              <div className="mt-3 flex justify-between px-1 text-[.68rem] text-[#66807c]"><span>06:00</span><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div>
            </article>

            <article className="panel rounded-[1.35rem] border border-white/[.08] p-4 sm:p-5">
              <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-white">Campus mobility</p><p className="mt-1 text-xs text-[#859d9a]">Today’s low-carbon movement</p></div><Bike size={19} className="text-[#a6f1c4]" /></div>
              <div className="mt-6 flex items-center justify-center gap-6"><div className="mobility-ring"><strong>68%</strong><span>low-carbon</span></div><div className="space-y-3 text-sm"><p className="flex items-center gap-2 text-[#b4c7c5]"><BusFront size={15} className="text-[#72ddab]" />1,286 shuttle trips</p><p className="flex items-center gap-2 text-[#b4c7c5]"><Bike size={15} className="text-[#79c8ff]" />438 bike rides</p><p className="flex items-center gap-2 text-[#b4c7c5]"><Activity size={15} className="text-[#c29bff]" />2.1 tCO₂e avoided</p></div></div>
              <div className="mt-5 rounded-xl bg-white/[.045] px-3 py-2.5 text-xs leading-5 text-[#a0b8b5]"><span className="font-medium text-[#a4f2c3]">Good timing:</span> bus capacity stays below 82% until 5:20 PM.</div>
            </article>
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
            <article className="panel rounded-[1.35rem] border border-white/[.08] p-4 sm:p-5">
              <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-white">Priority recommendations</p><p className="mt-1 text-xs text-[#859d9a]">Ranked by projected campus impact</p></div><button className="text-xs font-medium text-[#9cf0bd]">View all</button></div>
              <div className="mt-4 divide-y divide-white/[.07]">{recommendations.map((item) => { const Icon = item.icon; const done = completed.includes(item.id); return <div key={item.id} className="flex gap-3 py-3.5 first:pt-0 last:pb-0"><div className={`recommendation-icon ${item.className}`}><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`text-sm font-medium ${done ? "text-[#8da29f] line-through" : "text-white"}`}>{item.title}</p><span className="tag">{item.level}</span></div><p className="mt-1 text-xs leading-5 text-[#8ca3a0]">{item.detail}</p><p className="mt-2 text-xs font-medium text-[#9df1bd]">Potential reduction: {item.impact}</p></div><button onClick={() => completeRecommendation(item.id)} disabled={done} aria-label={`Mark ${item.title} as planned`} className={`grid size-8 flex-none place-items-center rounded-lg border ${done ? "border-[#295246] bg-[#193d34] text-[#9bf0bd]" : "border-white/[.12] text-[#91aaa6] hover:border-[#6dcc9c] hover:text-[#b5f7cf]"}`}>{done ? <CircleCheck size={16} /> : <span className="text-lg leading-none">+</span>}</button></div>; })}</div>
            </article>
            <article className="panel rounded-[1.35rem] border border-white/[.08] p-4 sm:p-5">
              <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-white">Active alerts</p><p className="mt-1 text-xs text-[#859d9a]">AI-detected anomalies requiring review</p></div><span className="grid size-7 place-items-center rounded-full bg-[#4a2c18] text-xs font-semibold text-[#ffca82]">2</span></div>
              <div className="mt-5 space-y-3"><div className="alert-row"><AlertTriangle size={17} className="mt-0.5 text-[#ffbe6b]" /><div><p className="text-sm font-medium text-white">Water flow anomaly</p><p className="mt-1 text-xs leading-5 text-[#94aaa7]">Science Block · 02:00–05:00</p></div></div><div className="alert-row"><Zap size={17} className="mt-0.5 text-[#cfacff]" /><div><p className="text-sm font-medium text-white">Peak demand approaching</p><p className="mt-1 text-xs leading-5 text-[#94aaa7]">Admin Block · expected at 14:30</p></div></div></div>
              <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[.1] py-2.5 text-sm font-medium text-[#bcd0cd] hover:bg-white/[.05]"><AlertTriangle size={15} />Review alerts</button>
            </article>
          </section>
          <p aria-live="polite" className="sr-only">{notice}</p>
        </main>
      </div>
    </SidebarProvider>
  );
}
