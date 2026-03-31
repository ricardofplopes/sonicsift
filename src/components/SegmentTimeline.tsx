import type { Segment } from "@/types";

interface SegmentTimelineProps {
  segments: Segment[];
  totalDuration: number;
  onToggle: (index: number) => void;
}

export default function SegmentTimeline({
  segments,
  totalDuration,
  onToggle,
}: SegmentTimelineProps) {
  if (totalDuration === 0) return null;

  return (
    <div className="w-full">
      {/* Time axis labels */}
      <div className="flex justify-between text-xs text-gray-500 mb-1 px-0.5">
        <span>0:00</span>
        <span>{formatDuration(totalDuration / 4)}</span>
        <span>{formatDuration(totalDuration / 2)}</span>
        <span>{formatDuration((totalDuration * 3) / 4)}</span>
        <span>{formatDuration(totalDuration)}</span>
      </div>

      {/* Timeline bar */}
      <div className="flex w-full h-10 rounded-lg overflow-hidden border border-gray-700 bg-gray-900">
        {segments.map((seg, i) => {
          const widthPercent = (seg.duration / totalDuration) * 100;
          const isSpeech = seg.segmentType === "speech";

          let bgColor: string;
          if (seg.keep) {
            bgColor = isSpeech
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-emerald-800 hover:bg-emerald-700";
          } else {
            bgColor = isSpeech
              ? "bg-red-800 hover:bg-red-700"
              : "bg-red-900/60 hover:bg-red-800/60";
          }

          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              title={`${isSpeech ? "Speech" : "Silence"} · ${formatDuration(seg.start)}–${formatDuration(seg.end)} · ${seg.keep ? "Kept" : "Discarded"}`}
              className={`h-full transition-colors cursor-pointer border-r border-gray-800 last:border-r-0 ${bgColor}`}
              style={{ width: `${widthPercent}%`, minWidth: widthPercent > 0.5 ? "2px" : "1px" }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs text-gray-400">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-600" />
          Speech (kept)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-900/60" />
          Silence (discarded)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-800" />
          Speech (discarded)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-800" />
          Silence (kept)
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
