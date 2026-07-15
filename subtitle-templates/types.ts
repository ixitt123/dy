export type SubtitleWord = {
  text: string;
  startMs: number;
  endMs: number;
};

export type SubtitleSegment = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words?: SubtitleWord[];
  speaker?: string;
  emphasisWords?: string[];
};

export type SubtitleTemplateConfig = {
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  accentColor: string;
  position: { x: number; y: number };
  maxLines: number;
  animationSpeed: number;
  backgroundOpacity: number;
  outlineEnabled: boolean;
  shadowEnabled: boolean;
};

export type SubtitleTemplateProps = {
  segments: SubtitleSegment[];
  currentTimeMs: number;
  width: number;
  height: number;
  config: SubtitleTemplateConfig;
};

export type SubtitleTemplateDefinition = {
  id: string;
  name: string;
  description: string;
  previewImage: string;
  previewVideo?: string;
  supportedTiming: Array<"sentence" | "word">;
  supportedAspectRatios: Array<"16:9" | "9:16" | "1:1">;
  defaultConfig: SubtitleTemplateConfig;
  renderer: (props: SubtitleTemplateProps) => JSX.Element | null;
};
