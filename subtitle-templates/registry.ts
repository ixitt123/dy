import type { SubtitleTemplateDefinition } from "./types";
import rollingFocus from "./rolling-focus";
import rollingFocusSubtitle from "./rolling-focus-subtitle";

export const subtitleTemplates: Record<string, SubtitleTemplateDefinition> = {
  "rolling-focus": rollingFocus,
  "rolling-focus-subtitle": rollingFocusSubtitle,
};

export const subtitleTemplateList = Object.values(subtitleTemplates);
