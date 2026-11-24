import { useMemo } from "react";
import type { Segment, TimeRange } from "@/types";
import { computeSpeechDensity, formatTimecode } from "@/lib/timeRange";

interface SpeechDensityBarProps {
  segments: Segment[];
  totalDuration: number;
  cropRange: TimeRange | null;
  bins?: number;
}

/** Heatmap of how much detected speech falls into each slice of the file. */
export default function SpeechDensityBar({
  segments,
  totalDuration,
  cropRange,
  bins = 200,
}: SpeechDensityBarProps) {
  const density = useMemo(
    () => computeSpeechDensity(segments, totalDuration, bins),
    [segments, totalDuration, bins],
  );

  if (density.length === 0) return null;

  const binSize = totalDuration / density.length;

  return (
    <div className="w-full">
      <div className="flex justify-between items-center text-xs text-gray-500 mb-1">
        <span>Speech density</span>
        <span className="flex items-center gap-1.5">
          Less
          <span className="w-16 h-2 rounded-sm bg-gradient-to-r from-sonic-950 to-sonic-400" />
          More
        </span>
      </div>
      <div className="flex w-full h-4 rounded-md overflow-hidden border border-gray-700 bg-gray-900">
        {density.map((d, i) => {
          const binStart = i * binSize;
          const binEnd = binStart + binSize;
          const center = binStart + binSize / 2;
          const inRange =
            !cropRange || (center >= cropRange.start && center <= cropRange.end);
          return (
            <div
              key={i}
              className="flex-1 h-full transition-opacity duration-200"
              style={{
                backgroundColor: `rgba(102, 144, 255, ${0.06 + d * 0.94})`,
                opacity: inRange ? 1 : 0.25,
              }}
              title={`${formatTimecode(binStart)} – ${formatTimecode(binEnd)}: ${Math.round(d * 100)}% speech`}
            />
          );
        })}
      </div>
    </div>
  );
}
