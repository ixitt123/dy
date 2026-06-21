export function initCollectorModule() {
  const page = document.querySelector('[data-page="collector"]');
  if (page) page.dataset.module = "collector";
}
