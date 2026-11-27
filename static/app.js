const $ = (selector) => document.querySelector(selector);
const formatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const number = (value) => value == null ? "—" : formatter.format(value);
const units = { energy: "kWh", water: "kL" };
let dataset = sessionStorage.getItem("verdyn-dataset") || "demo";
let resource = "energy";
let state;
let activeLoad;

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    const error = new Error(typeof body?.detail === "string" ? body.detail : "The request failed. Try again.");
    error.status = response.status;
    throw error;
  }
  return body;
}

function row(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function setupPage() {
  const paths = {
    "/": ["overview", "Campus dashboard"],
    "/buildings": ["buildings", "Building comparison"],
    "/actions": ["actions", "Action plan"],
    "/insights": ["insights", "Insights & signals"],
    "/imports": ["imports", "Imports & datasets"],
    "/quality": ["quality", "Data quality"],
  };
  const [page, title] = paths[location.pathname] || paths["/"];
  document.body.classList.add("page-" + page);
  $(".welcome h1").textContent = title;
  for (const link of document.querySelectorAll(".sidebar nav a, .mobile-nav a")) {
    if (new URL(link.href).pathname === location.pathname) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    } else link.classList.remove("active");
  }
}

async function load(id, fallback = false) {
  activeLoad?.abort();
  const controller = new AbortController();
  activeLoad = controller;
  const status = $("#dashboard-status");
  status.textContent = "Loading dashboard…";
  status.classList.remove("has-error");
  $(".content").setAttribute("aria-busy", "true");
  try {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    const [next, datasets] = await Promise.all([
      request("/api/dashboard?dataset=" + encodeURIComponent(id), {signal, cache:"no-store"}),
      request("/api/datasets", {signal, cache:"no-store"}),
    ]);
    if (controller.signal.aborted) return;
    dataset = id;
    sessionStorage.setItem("verdyn-dataset", dataset);
    state = next;
    if (!state.chart[resource].length && state.chart.water.length) resource = "water";
    if (!state.chart[resource].length && state.chart.energy.length) resource = "energy";
    render();
    renderDatasets(datasets);
    status.textContent = "";
  } catch (error) {
    if (controller.signal.aborted) return;
    if (fallback && error.status === 404 && id !== "demo") return load("demo");
    $("#dataset-select").value = dataset;
    status.classList.add("has-error");
    status.textContent = error.name === "TimeoutError" ? "The dashboard took too long to load." : error.message;
    const retry = row("button", "btn light", "Retry");
    retry.addEventListener("click", () => void load(id));
    status.append(" ", retry);
  } finally {
    if (activeLoad === controller) $(".content").setAttribute("aria-busy", "false");
  }
}

function renderDatasets(datasets) {
  const options = datasets.map((item) => new Option(item.name, item.id, false, item.id === dataset));
  $("#dataset-select").replaceChildren(...options);
  $("#dataset-list").replaceChildren(...datasets.map((item) => {
    const itemRow = row("div", "dataset-row");
    const description = row("div", "");
    description.append(row("b", "", item.name), row("small", "", number(item.rows) + " readings · " + item.mode));
    const open = row("button", "", item.id === dataset ? "Selected" : "Open");
    open.type = "button";
    open.disabled = item.id === dataset;
    open.addEventListener("click", () => void load(item.id));
    itemRow.append(description, open);
    return itemRow;
  }));
}

function render() {
  const demo = dataset === "demo";
  const mode = demo ? "Simulated demo" : "Uploaded CSV";
  const period = state.period;
  $("#dataset-period").textContent = period ? period.start + " to " + period.end + " · IST" : mode;
  $("#source-label").textContent = mode;
  $("#footer-source").textContent = mode;
  $("#insight-title").textContent = demo ? state.insight.title : state.account.campus;
  const buildingCount = number(state.kpis.buildings) + (state.kpis.buildings === 1 ? " building" : " buildings");
  $("#insight-description").textContent = demo ? state.insight.body : buildingCount + " · " + number(state.kpis.coverage) + "% reading coverage";
  for (const [kind, unit] of Object.entries(units)) {
    $("#" + kind + "-total").textContent = state.kpis[kind] == null ? "No readings" : number(state.kpis[kind]) + " " + unit;
  }
  $("#coverage-total").textContent = number(state.kpis.coverage) + "%";
  $("#coverage-detail").textContent = demo ? "Coverage for the selected demo period." : number(state.kpis.missing) + " missing hourly readings.";
  $("#alert-count").textContent = state.alerts.length + " active";

  $("#building-cards").replaceChildren(...state.buildings.map((building) => {
    const card = row("article", "building-card");
    const metrics = row("div", "building-metrics");
    for (const [kind, unit] of Object.entries(units)) {
      const metric = row("div", "");
      metric.append(row("strong", "", number(building[kind])), row("small", "", unit));
      metrics.append(metric);
    }
    card.append(row("h3", "", building.name), metrics);
    return card;
  }));

  const alerts = state.alerts.map((alert) => {
    const card = row("div", "alert-row");
    const content = row("div", "");
    content.append(row("h4", "", alert.title), row("p", "", alert.detail), row("small", "", alert.building + " · " + alert.time));
    card.append(row("span", "alert-bar " + alert.severity), content);
    return card;
  });
  $("#alerts-list").replaceChildren(...(alerts.length ? alerts : [row("p", "", "Signal checks are available in the demo dataset.")]));
  const actions = state.actions.map((action) => {
    const card = row("div", "action-row");
    const toggle = row("button", "check" + (action.done ? " done" : ""), action.done ? "✓" : "○");
    toggle.setAttribute("aria-label", action.title);
    toggle.setAttribute("aria-pressed", String(action.done));
    toggle.addEventListener("click", async () => {
      toggle.disabled = true;
      try {
        const updated = await request("/api/actions/" + encodeURIComponent(action.id) + "/toggle?dataset=" + encodeURIComponent(dataset), {method:"POST"});
        action.done = updated.done;
        render();
      } catch (error) {
        $("#dashboard-status").textContent = error.message;
        toggle.disabled = false;
      }
    });
    const content = row("div", "");
    content.append(row("h4", "", action.title), row("p", "", action.detail));
    card.append(toggle, content);
    return card;
  });
  $("#actions-list").replaceChildren(...(actions.length ? actions : [row("p", "", "No review actions for this dataset.")]));
  drawResource();
}

function drawResource() {
  if (!state) return;
  for (const button of document.querySelectorAll("[data-resource]")) {
    const selected = button.dataset.resource === resource;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  const series = state.chart[resource];
  const max = Math.max(1, ...series.map((item) => item.value));
  const points = series.map((item, index) =>
    (index / Math.max(1, series.length - 1) * 720) + "," + (235 - item.value / max * 205));
  const curve = points.length ? "M " + points.join(" L ") + (points.length === 1 ? " h 2" : "") : "";
  $("#line").setAttribute("d", curve);
  $("#area").setAttribute("d", points.length > 1 ? curve + " L 720,235 L 0,235 Z" : "");
  $(".y-axis").replaceChildren(...(series.length ? [max, max * .5, 0].map((val) => row("span", "", number(val))) : []));
  const labelCount = Math.min(5, series.length);
  const labels = Array.from({length:labelCount}, (_, n) => series[Math.round(n * (series.length - 1) / Math.max(1, labelCount - 1))].timestamp.slice(0, 10));
  $(".x-axis").replaceChildren(...labels.map((date) => row("span", "", date)));
  $("#chart-status").textContent = points.length ? "Consumption in " + units[resource] : "No " + resource + " readings in this dataset.";
  const forecast = state.forecast[resource];
  $("#forecast-title").textContent = (resource === "energy" ? "Energy" : "Water") + " forecast";
  $("#forecast-total").textContent = forecast ? number(forecast.total) + " " + forecast.unit : "Unavailable";
  $("#forecast-detail").textContent = forecast?.date
    ? forecast.date + " · Peak at " + forecast.peak + " IST · Same-hour median"
    : forecast ? "Simulated forecast · Peak at " + forecast.peak + " IST"
      : "Forecasts need four complete days shared by the buildings with this resource.";
  const bars = forecast?.points ?? [];
  const ceiling = Math.max(1, ...bars);
  $("#forecast-bars").replaceChildren(...bars.map((value) => {
    const bar = row("i", "");
    bar.style.height = value / ceiling * 100 + "%";
    return bar;
  }));
  $("#forecast-bars").hidden = !bars.length;
}

async function importCsv(input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  const status = $("#import-status");
  const results = $("#import-results");
  let saved = 0;
  let lastSuccess;
  input.value = "";
  input.disabled = true;
  results.replaceChildren();
  try {
    for (const [index, file] of files.entries()) {
      status.textContent = "Importing file " + (index + 1) + " of " + files.length + "…";
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await request("/api/import", {method:"POST", body:form, signal:AbortSignal.timeout(60_000)});
        results.append(row("li", "", file.name + " · " + number(result.rows) + " readings saved."));
        lastSuccess = result.id;
        saved++;
      } catch (error) {
        results.append(row("li", "import-failure", file.name + " · " + error.message));
      }
    }
    if (lastSuccess) await load(lastSuccess);
    status.textContent = saved + " of " + files.length + " files imported.";
  } finally {
    input.disabled = false;
  }
}

setupPage();
$("#dataset-select").addEventListener("change", (event) => void load(event.target.value));
$("#csv-file").addEventListener("change", (event) => void importCsv(event.target));
document.querySelectorAll("[data-resource]").forEach((button) => {
  button.addEventListener("click", () => { resource = button.dataset.resource; drawResource(); });
});
void load(dataset, true);
