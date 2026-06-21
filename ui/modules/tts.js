export function initTtsModule() {
  const page = document.querySelector('[data-page="tts"]');
  if (page) page.dataset.module = "tts";
}
