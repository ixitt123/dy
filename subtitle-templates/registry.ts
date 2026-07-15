import type { SubtitleTemplateDefinition } from "./types";
import rollingFocus from "./rolling-focus";
import rollingFocusSubtitle from "./rolling-focus-subtitle";
import wordHighlight from "./word-highlight";
import karaokeSweep from "./karaoke-sweep";
import centerStatement from "./center-statement";
import keywordEmphasis from "./keyword-emphasis";
import phrasePop from "./phrase-pop";
import dialogueTwoLine from "./dialogue-two-line";
import documentaryMinimal from "./documentary-minimal";
import captionCard from "./caption-card";
import keywordTags from "./keyword-tags";

export const subtitleTemplates: Record<string, SubtitleTemplateDefinition> = {
  "rolling-focus": rollingFocus,
  "rolling-focus-subtitle": rollingFocusSubtitle,
  "word-highlight": wordHighlight,
  "karaoke-sweep": karaokeSweep,
  "center-statement": centerStatement,
  "keyword-emphasis": keywordEmphasis,
  "phrase-pop": phrasePop,
  "dialogue-two-line": dialogueTwoLine,
  "documentary-minimal": documentaryMinimal,
  "caption-card": captionCard,
  "keyword-tags": keywordTags,
};

export const subtitleTemplateList = Object.values(subtitleTemplates);
