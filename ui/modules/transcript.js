export function initTranscriptModule() {
  const page = document.querySelector('[data-page="transcript"]');
  if (page) page.dataset.module = "transcript";
}
