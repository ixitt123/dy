export function initRewriteModule() {
  const page = document.querySelector('[data-page="rewrite"]');
  if (page) page.dataset.module = "rewrite";
}
