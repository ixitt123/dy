import { JimengProvider } from "./jimeng.js";
import { VolcengineArkImageProvider } from "./volcengine-ark.js";

export const IMAGE_PROVIDER_LABELS = {
  jimeng: "即梦 AI",
  volcengine_ark: "火山方舟 Seedream",
};

export function createImageProvider(id, options = {}) {
  switch (id) {
    case "jimeng": return new JimengProvider(options);
    case "volcengine_ark": return new VolcengineArkImageProvider(options);
    default: return null;
  }
}
