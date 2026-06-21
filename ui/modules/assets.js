export function initAssetsModule() {
  const page = document.querySelector('[data-page="assets"]');
  if (page) page.dataset.module = "assets";
}
