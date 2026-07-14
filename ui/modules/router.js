const ROUTE_ALIASES = {
  analysis: "transcript",
  files: "assets",
  vfo: "dashboard",
};

export function normalizeRoute(route) {
  const value = String(route || "dashboard").replace(/^#/, "");
  return ROUTE_ALIASES[value] || value;
}

export function navigate(route, options = {}) {
  const normalized = normalizeRoute(route);
  if (typeof window.workbenchNavigate === "function") {
    window.workbenchNavigate(normalized, options);
  } else {
    window.location.hash = normalized;
  }
}

export function initRouter() {
  window.appNavigate = navigate;
  document.addEventListener("workbench:route", (event) => {
    document.body.dataset.activeModule = normalizeRoute(event.detail?.page);
  });
}
