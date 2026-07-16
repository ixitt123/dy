const STORAGE_KEY = "dy:parameter-panels:collapsed:v1";

function readState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function directHeader(panel) {
  return [...panel.children].find((child) => child.matches?.(".kinetic-card-head,.section-head,.panel-head,.settings-head,header,h2,h3")) || null;
}

function isParameterPanel(panel) {
  if (!(panel instanceof HTMLElement) || panel.dataset.parameterCollapseReady === "true") return false;
  if (panel.matches("details,[data-no-parameter-collapse],.kinetic-preview-card,.kinetic-output-card,.kinetic-effects-card,.kinetic-timeline-card")) return false;
  if (panel.closest("[data-no-parameter-collapse]")) return false;
  if (!directHeader(panel)) return false;
  if (panel.dataset.parameterPanel) return true;
  return Boolean(panel.querySelector("select,input[type='range'],input[type='color'],input[type='checkbox'],input[type='radio']"));
}

function panelKey(panel, header) {
  const page = panel.closest("[data-page]")?.dataset.page || "global";
  const identity = panel.dataset.parameterPanel || panel.id || header.textContent.trim().replace(/\s+/g, "-").slice(0, 48) || [...panel.parentElement.children].indexOf(panel);
  return `${page}:${identity}`;
}

function enhance(panel) {
  if (!isParameterPanel(panel)) return;
  const header = directHeader(panel);
  const key = panelKey(panel, header);
  const body = document.createElement("div");
  body.className = "parameter-panel-body";
  [...panel.children].filter((child) => child !== header).forEach((child) => body.append(child));
  panel.append(body);
  panel.dataset.parameterCollapseReady = "true";
  panel.classList.add("parameter-panel");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "parameter-panel-toggle";
  toggle.setAttribute("aria-label", "收起或展开参数");
  header.append(toggle);
  const stored = readState();
  const apply = (collapsed) => {
    panel.classList.toggle("is-collapsed", collapsed);
    toggle.textContent = collapsed ? "展开" : "收起";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  };
  apply(stored[key] === true);
  toggle.addEventListener("click", () => {
    const collapsed = !panel.classList.contains("is-collapsed");
    apply(collapsed);
    const next = readState();
    next[key] = collapsed;
    saveState(next);
  });
}

export function initCollapsibleParameterPanels() {
  const scan = (root = document) => root.querySelectorAll?.(".workbench-page section,.workbench-page article,[data-parameter-panel]").forEach(enhance);
  scan();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node.classList.contains("parameter-panel-body")) continue;
        if (node.matches?.(".workbench-page section,.workbench-page article,[data-parameter-panel]")) enhance(node);
        scan(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
