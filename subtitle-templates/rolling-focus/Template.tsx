import type { SubtitleTemplateProps } from "../types";
import { activeSegmentIndex } from "../helpers";

export default function RollingFocusTemplate({ segments, currentTimeMs, config }: SubtitleTemplateProps) {
  const active = activeSegmentIndex(segments, currentTimeMs);
  if (active < 0) return null;
  return <div className="subtitle-rolling-focus" style={{ position: "absolute", left: `${config.position.x}%`, top: `${config.position.y}%`, transform: "translate(-50%,-50%)", width: "82%" }}>
    {segments.slice(Math.max(0, active - 1), active + 2).map((segment) => {
      const isCurrent = segment.id === segments[active].id;
      return <div key={segment.id} data-current={isCurrent} style={{ color: isCurrent ? config.primaryColor : "#7B8493", fontFamily: config.fontFamily, fontSize: isCurrent ? config.fontSize : config.fontSize * 0.64, fontWeight: isCurrent ? 800 : 600, opacity: isCurrent ? 1 : 0.48, lineHeight: 1.35, transform: `scale(${isCurrent ? 1 : 0.96})` }}>{isCurrent ? "▶  " : ""}{segment.text}</div>;
    })}
  </div>;
}
