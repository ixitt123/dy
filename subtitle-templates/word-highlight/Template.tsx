import type { SubtitleTemplateProps } from "../types";
import { activeSegmentIndex, activeWordIndex, phraseAtTime } from "../helpers";

export default function WordHighlightTemplate({ segments, currentTimeMs, config }: SubtitleTemplateProps) {
  const index = activeSegmentIndex(segments, currentTimeMs); if (index < 0) return null;
  const segment = segments[index]; const phrase = phraseAtTime(segment.words, currentTimeMs, 5); const active = activeWordIndex(phrase, currentTimeMs);
  return <div className="subtitle-word-highlight" style={{ position: "absolute", left: `${config.position.x}%`, top: `${config.position.y}%`, transform: "translate(-50%,-50%)", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "0 .28em", width: "84%", fontFamily: config.fontFamily, fontSize: config.fontSize, fontWeight: 900 }}>
    {(phrase.length ? phrase : [{ text: segment.text, startMs: segment.startMs, endMs: segment.endMs }]).map((word, wordIndex) => <span key={`${word.startMs}-${wordIndex}`} style={{ color: wordIndex === active ? config.accentColor : config.primaryColor, transform: `scale(${wordIndex === active ? 1.1 : 1})`, display: "inline-block" }}>{word.text}</span>)}
  </div>;
}
