import { JimengProvider } from "./jimeng.js";

export const IMAGE_PROVIDER_LABELS = { jimeng: "即梦 AI" };

export function createImageProvider(id, options = {}) {
  switch (id) {
    case "jimeng": return new JimengProvider(options);
    default: return null;
  }
}
