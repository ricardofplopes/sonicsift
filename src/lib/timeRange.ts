import type { Segment, TimeRange } from "@/types";

/** Shortest crop range the user can select, in seconds. */
export const MIN_CROP_LENGTH_S = 1;

/** Kept ranges separated by at most this gap are merged into one extract. */
const MERGE_GAP_S = 0.005;

/** Export ranges shorter than this are dropped (FFmpeg can't extract them reliably). */
const MIN_EXPORT_RANGE_S = 0.01;

const EPSILON = 0.001;

const NUM = "\\d+(?:\\.\\d+)?";
const UNIT_RE = new RegExp(
  `^(?:(${NUM})\\s*h)?\\s*(?:(${NUM})\\s*m(?:in)?)?\\s*(?:(${NUM})\\s*s(?:ec)?)?$`,
  "i",
);

/**
 * Parse a user-typed time into seconds.
 *
 * Accepts `H:MM:SS`, `M:SS` (fractional seconds allowed), unit forms such as
 * `1h40m`, `90m` or `45s`, and bare numbers, which are interpreted as
 * **minutes**. Returns `null` when the text can't be parsed.
 */
export function parseTimecode(text: string): number | null {
  const value = text.trim();
  if (!value) return null;

  if (value.includes(":")) {
    const parts = value.split(":");
    if (parts.length > 3) return null;
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const pattern = isLast ? /^\d+(\.\d+)?$/ : /^\d+$/;
      if (!pattern.test(parts[i])) return null;
      const n = Number(parts[i]);
      if (i > 0 && n >= 60) return null;
      seconds = seconds * 60 + n;
    }
    return seconds;
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value) * 60;
  }

  const m = UNIT_RE.exec(value);
  if (m && (m[1] || m[2] || m[3])) {
    return (
      Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
    );
  }

  return null;
}

/** Format seconds as `H:MM:SS` (rounded to the nearest second). */
export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Length of the timeline in seconds. Detection can report timestamps past the
 * ffprobe estimate (e.g. raw AAC), so the last segment end wins if larger.
 */
export function getTimelineDuration(
  audioDuration: number,
  segments: Segment[],
): number {
  let total = audioDuration > 0 ? audioDuration : 0;
  for (const seg of segments) {
    if (seg.end > total) total = seg.end;
  }
  return total;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

/** Round to whole seconds, except that the very end of the file stays exact. */
function snapTime(time: number, total: number): number {
  if (time >= total) return total;
  return Math.max(0, Math.round(time));
}

/**
 * Normalize a typed range: clamp to `[0, total]`, snap to whole seconds,
 * swap inverted bounds and enforce a minimum length.
 */
export function clampRange(
  range: TimeRange,
  total: number,
  minLength = MIN_CROP_LENGTH_S,
): TimeRange {
  if (total <= 0) return { start: 0, end: 0 };
  const minLen = Math.min(minLength, total);

  let start = snapTime(clamp(range.start, 0, total), total);
  let end = snapTime(clamp(range.end, 0, total), total);
  if (start > end) [start, end] = [end, start];

  if (end - start < minLen) {
    end = Math.min(start + minLen, total);
    start = Math.max(0, end - minLen);
  }
  return { start, end };
}

/**
 * Move one edge of a range (e.g. while dragging a handle). The moved edge is
 * snapped to whole seconds and can't cross the other edge.
 */
export function moveRangeEdge(
  range: TimeRange,
  edge: "start" | "end",
  time: number,
  total: number,
  minLength = MIN_CROP_LENGTH_S,
): TimeRange {
  const minLen = Math.min(minLength, total);
  const t = snapTime(clamp(time, 0, total), total);
  if (edge === "start") {
    return {
      start: clamp(t, 0, Math.max(0, range.end - minLen)),
      end: range.end,
    };
  }
  return {
    start: range.start,
    end: clamp(t, Math.min(total, range.start + minLen), total),
  };
}

/** True when `range` covers the whole timeline (i.e. no crop). */
export function isFullRange(range: TimeRange, total: number): boolean {
  return range.start <= EPSILON && range.end >= total - EPSILON;
}

/**
 * Segments that intersect `range`, with their bounds clipped to it.
 * A `null` range means the full file and returns `segments` unchanged.
 */
export function clipSegmentsToRange(
  segments: Segment[],
  range: TimeRange | null,
): Segment[] {
  if (!range) return segments;
  const result: Segment[] = [];
  for (const seg of segments) {
    const start = Math.max(seg.start, range.start);
    const end = Math.min(seg.end, range.end);
    if (end > start) {
      result.push({ ...seg, start, end, duration: end - start });
    }
  }
  return result;
}

/**
 * Time ranges to send to the export command: kept segments clipped to the
 * crop range, with contiguous ranges merged so they're extracted (and
 * enhanced) as one continuous piece instead of crossfaded fragments.
 */
export function buildExportRanges(
  segments: Segment[],
  range: TimeRange | null,
): TimeRange[] {
  const clipped = clipSegmentsToRange(
    segments.filter((s) => s.keep),
    range,
  )
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const r of clipped) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= MERGE_GAP_S) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.filter((r) => r.end - r.start >= MIN_EXPORT_RANGE_S);
}

/**
 * Fraction (0–1) of each of `bins` equal time slices covered by detected
 * speech, regardless of keep/discard state.
 */
export function computeSpeechDensity(
  segments: Segment[],
  total: number,
  bins: number,
): number[] {
  if (total <= 0 || bins <= 0) return [];
  const binSize = total / bins;
  const covered = new Array<number>(bins).fill(0);

  for (const seg of segments) {
    if (seg.segmentType !== "speech") continue;
    const start = clamp(seg.start, 0, total);
    const end = clamp(seg.end, 0, total);
    if (end <= start) continue;

    const first = Math.min(bins - 1, Math.floor(start / binSize));
    const last = Math.min(bins - 1, Math.floor(end / binSize));
    for (let b = first; b <= last; b++) {
      const overlap =
        Math.min(end, (b + 1) * binSize) - Math.max(start, b * binSize);
      if (overlap > 0) covered[b] += overlap;
    }
  }

  return covered.map((c) => clamp(c / binSize, 0, 1));
}
