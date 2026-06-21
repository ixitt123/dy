export function initProjectModule() {
  const page = document.querySelector('[data-page="dashboard"]');
  if (page) page.dataset.module = "project";
}
