export function initSettingsModule() {
  const page = document.querySelector('[data-page="settings"]');
  if (page) page.dataset.module = "settings";
}
