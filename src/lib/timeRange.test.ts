import { describe, expect, it } from "vitest";
import type { Segment } from "@/types";
import {
  buildExportRanges,
  clampRange,
  clipSegmentsToRange,
  computeSpeechDensity,
  formatTimecode,
  getTimelineDuration,
  isFullRange,
  moveRangeEdge,
  parseTimecode,
} from "@/lib/timeRange";

function seg(
  start: number,
  end: number,
  segmentType: Segment["segmentType"],
  keep = segmentType === "speech",
): Segment {
  return { start, end, duration: end - start, segmentType, keep };
}

describe("parseTimecode", () => {
  it.each([
    ["1:40:00", 6000],
    ["0:30:00", 1800],
    ["30:15", 1815],
    ["1:05.5", 65.5],
    ["30", 1800],
    ["2.5", 150],
    ["1h40m", 6000],
    ["1h 40m 30s", 6030],
    ["90min", 5400],
    ["45s", 45],
    ["  100  ", 6000],
  ])("parses %j as %d seconds", (text, expected) => {
    expect(parseTimecode(text)).toBe(expected);
  });

  it.each(["", "abc", "1:60", "1:2:3:4", "-5", "1:", "h", "10ms", "1:30.5:00"])(
    "rejects %j",
    (text) => {
      expect(parseTimecode(text)).toBeNull();
    },
  );
});

describe("formatTimecode", () => {
  it("formats as H:MM:SS and rounds to the nearest second", () => {
    expect(formatTimecode(0)).toBe("0:00:00");
    expect(formatTimecode(6000)).toBe("1:40:00");
    expect(formatTimecode(36000 - 0.4)).toBe("10:00:00");
    expect(formatTimecode(-3)).toBe("0:00:00");
  });
});

describe("getTimelineDuration", () => {
  it("extends past the probed duration when segments run longer", () => {
    expect(getTimelineDuration(100, [seg(0, 50, "speech")])).toBe(100);
    expect(getTimelineDuration(100, [seg(90, 104.2, "speech")])).toBe(104.2);
  });
});

describe("clampRange", () => {
  it("clamps to the timeline and snaps to whole seconds", () => {
    expect(clampRange({ start: -10, end: 1800.4 }, 3600)).toEqual({
      start: 0,
      end: 1800,
    });
  });

  it("keeps a fractional end of file exact", () => {
    expect(clampRange({ start: 10, end: 9999 }, 3600.47)).toEqual({
      start: 10,
      end: 3600.47,
    });
  });

  it("swaps inverted bounds", () => {
    expect(clampRange({ start: 6000, end: 1800 }, 36000)).toEqual({
      start: 1800,
      end: 6000,
    });
  });

  it("enforces the minimum length, also at the end of the file", () => {
    expect(clampRange({ start: 50, end: 50 }, 100)).toEqual({ start: 50, end: 51 });
    expect(clampRange({ start: 100, end: 100 }, 100)).toEqual({ start: 99, end: 100 });
  });
});

describe("moveRangeEdge", () => {
  const range = { start: 100, end: 200 };

  it("moves only the dragged edge", () => {
    expect(moveRangeEdge(range, "start", 49.6, 1000)).toEqual({ start: 50, end: 200 });
    expect(moveRangeEdge(range, "end", 1500, 1000)).toEqual({ start: 100, end: 1000 });
  });

  it("does not let edges cross", () => {
    expect(moveRangeEdge(range, "start", 500, 1000)).toEqual({ start: 199, end: 200 });
    expect(moveRangeEdge(range, "end", 0, 1000)).toEqual({ start: 100, end: 101 });
  });
});

describe("isFullRange", () => {
  it("detects whether the range covers the whole timeline", () => {
    expect(isFullRange({ start: 0, end: 100.5 }, 100.5)).toBe(true);
    expect(isFullRange({ start: 1, end: 100.5 }, 100.5)).toBe(false);
    expect(isFullRange({ start: 0, end: 100 }, 100.5)).toBe(false);
  });
});

describe("clipSegmentsToRange", () => {
  const segments = [
    seg(0, 10, "speech"),
    seg(10, 20, "silence"),
    seg(20, 30, "speech"),
    seg(30, 40, "silence"),
  ];

  it("returns segments unchanged for a null range", () => {
    expect(clipSegmentsToRange(segments, null)).toBe(segments);
  });

  it("clips straddling segments and drops those outside", () => {
    expect(clipSegmentsToRange(segments, { start: 15, end: 25 })).toEqual([
      seg(15, 20, "silence"),
      seg(20, 25, "speech"),
    ]);
  });

  it("drops segments that only touch the range boundary", () => {
    expect(clipSegmentsToRange(segments, { start: 10, end: 20 })).toEqual([
      seg(10, 20, "silence"),
    ]);
  });
});

describe("buildExportRanges", () => {
  it("exports only kept segments inside the crop range", () => {
    const segments = [
      seg(0, 10, "speech"),
      seg(10, 20, "silence"),
      seg(20, 30, "speech"),
      seg(30, 40, "silence"),
      seg(40, 50, "speech"),
    ];
    expect(buildExportRanges(segments, { start: 5, end: 45 })).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 30 },
      { start: 40, end: 45 },
    ]);
  });

  it("merges contiguous kept segments into one range", () => {
    const segments = [
      seg(0, 10, "speech"),
      seg(10, 20, "silence", true),
      seg(20.003, 30, "speech"),
      seg(30, 40, "silence"),
    ];
    expect(buildExportRanges(segments, null)).toEqual([{ start: 0, end: 30 }]);
  });

  it("turns a Keep All crop into a single continuous extract", () => {
    const segments = [
      seg(0, 600, "speech", true),
      seg(600, 1200, "silence", true),
      seg(1200, 36000, "speech", true),
    ];
    expect(buildExportRanges(segments, { start: 1800, end: 6000 })).toEqual([
      { start: 1800, end: 6000 },
    ]);
  });

  it("drops slivers left over at the crop boundary", () => {
    const segments = [seg(0, 10, "speech"), seg(10, 20, "silence")];
    expect(buildExportRanges(segments, { start: 9.995, end: 20 })).toEqual([]);
  });

  it("returns nothing when no kept audio is in range", () => {
    const segments = [seg(0, 10, "speech"), seg(10, 20, "silence")];
    expect(buildExportRanges(segments, { start: 12, end: 18 })).toEqual([]);
  });
});

describe("computeSpeechDensity", () => {
  it("returns the speech fraction of each bin", () => {
    const segments = [
      seg(0, 5, "speech"),
      seg(5, 15, "silence"),
      seg(15, 40, "speech", false),
    ];
    expect(computeSpeechDensity(segments, 40, 4)).toEqual([0.5, 0.5, 1, 1]);
  });

  it("handles an empty timeline", () => {
    expect(computeSpeechDensity([], 0, 10)).toEqual([]);
  });
});
