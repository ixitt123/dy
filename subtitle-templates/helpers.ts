import type { SubtitleSegment, SubtitleWord } from "./types";

export const activeSegmentIndex = (segments: SubtitleSegment[], timeMs: number) =>
  segments.findIndex((segment) => timeMs >= segment.startMs && timeMs <= segment.endMs);

export const activeWordIndex = (words: SubtitleWord[] = [], timeMs: number) =>
  words.findIndex((word) => timeMs >= word.startMs && timeMs < word.endMs);

export const phraseAtTime = (words: SubtitleWord[] = [], timeMs: number, size = 4) => {
  if (!words.length) return [];
  const active = Math.max(0, activeWordIndex(words, timeMs));
  const start = Math.floor(active / size) * size;
  return words.slice(start, start + size);
};

export const emphasisMatch = (text: string, words: string[] = []) =>
  words.some((word) => word && (text.includes(word) || word.includes(text)));
