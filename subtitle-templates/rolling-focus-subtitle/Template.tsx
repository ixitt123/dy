import type { SubtitleTemplateProps } from "../types";

const LEAD_MS = 90;
const TRANSITION_MS = 220;

export default function RollingFocusSubtitleTemplate({ segments, currentTimeMs, config }: SubtitleTemplateProps) {
  const active = segments.findIndex((segment) => currentTimeMs >= segment.startMs - LEAD_MS && currentTimeMs <= segment.endMs);
  if (active < 0) return null;
  const current = segments[active];
  const previous = segments[active - 1];
  const reset = !previous || current.startMs - previous.endMs > 1200;
  const progress = reset ? 1 : Math.max(0, Math.min(1, (currentTimeMs - (current.startMs - LEAD_MS)) / TRANSITION_MS));
  const gap = config.fontSize * 1.28;
  const first = reset ? active : Math.max(0, active - 2);
  const last = Math.min(segments.length - 1, active + 2);

  return <div className="subtitle-rolling-focus-left" style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000" }}>
    {segments.slice(first, last + 1).map((segment, offset) => {
      const index = first + offset;
      const delta = index - active;
      const isCurrent = delta === 0;
      const wasCurrent = delta === -1 && !reset;
      const size = isCurrent
        ? config.fontSize * (0.54 + 0.46 * progress)
        : wasCurrent
          ? config.fontSize * (1 - 0.46 * progress)
          : config.fontSize * 0.54;
      return <div key={segment.id} data-current={isCurrent} style={{
        position: "absolute",
        left: `${config.position.x}%`,
        top: `${config.position.y}%`,
        width: "48%",
        transform: `translateY(${(delta + (reset ? 0 : 1 - progress)) * gap}px) translateY(-50%)`,
        color: isCurrent || (wasCurrent && progress < 0.5) ? "#fff" : "#B7B7B7",
        fontFamily: config.fontFamily,
        fontSize: size,
        fontWeight: isCurrent || wasCurrent ? 800 : 500,
        lineHeight: 1,
        opacity: isCurrent ? 1 : Math.max(0.34, 0.7 - Math.abs(delta) * 0.14),
        whiteSpace: "nowrap",
      }}>{isCurrent ? "▶ " : ""}{segment.text}</div>;
    })}
  </div>;
}
