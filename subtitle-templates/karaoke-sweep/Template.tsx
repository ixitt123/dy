import type { SubtitleTemplateProps } from "../types";
import { activeSegmentIndex } from "../helpers";

export default function KaraokeSweepTemplate({ segments, currentTimeMs, config }: SubtitleTemplateProps) {
  const index = activeSegmentIndex(segments, currentTimeMs); if (index < 0) return null; const segment = segments[index];
  const progress = Math.max(0, Math.min(1, (currentTimeMs - segment.startMs) / Math.max(1, segment.endMs - segment.startMs)));
  const base = { position: "absolute" as const, inset: 0, display: "grid", placeItems: "center", fontFamily: config.fontFamily, fontSize: config.fontSize, fontWeight: 900, textAlign: "center" as const };
  return <div className="subtitle-karaoke-sweep" style={{ position: "absolute", left: "8%", right: "8%", top: `${config.position.y}%`, height: config.fontSize * 2, transform: "translateY(-50%)" }}><div style={{ ...base, color: config.primaryColor }}>{segment.text}</div><div style={{ ...base, color: config.accentColor, clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }}>{segment.text}</div></div>;
}
