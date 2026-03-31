import { useState, useRef } from "react";
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
  const [hovered, setHovered] = useState<{ index: number; left: number; top: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  if (totalDuration === 0) return null;

  const hoveredSeg = hovered !== null ? segments[hovered.index] : null;

  return (
    <div className="w-full relative" ref={containerRef}>
      {/* Time axis labels */}
      <div className="flex justify-between text-xs text-gray-500 mb-1 px-0.5">
        <span>0:00.0</span>
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
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const cRect = containerRef.current?.getBoundingClientRect();
                if (cRect) {
                  setHovered({
                    index: i,
                    left: rect.left - cRect.left + rect.width / 2,
                    top: rect.top - cRect.top,
                  });
                }
              }}
              onMouseLeave={() => setHovered(null)}
              className={`h-full cursor-pointer border-r border-gray-800 last:border-r-0 transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_12px_rgba(255,255,255,0.1)] hover:z-10 ${bgColor}`}
              style={{ width: `${widthPercent}%`, minWidth: widthPercent > 0.5 ? "2px" : "1px" }}
            />
          );
        })}
      </div>

      {/* Hover tooltip (rendered outside overflow-hidden bar) */}
      {hoveredSeg && hovered && (
        <div
          className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-lg pointer-events-none whitespace-nowrap animate-fade-in"
          style={{
            left: Math.max(60, Math.min(hovered.left, (containerRef.current?.offsetWidth ?? 300) - 60)),
            top: hovered.top - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold">
              {hoveredSeg.segmentType === "speech" ? "Speech" : "Silence"}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                hoveredSeg.keep
                  ? "bg-emerald-900/60 text-emerald-300"
                  : "bg-red-900/60 text-red-300"
              }`}
            >
              {hoveredSeg.keep ? "Kept" : "Discarded"}
            </span>
          </div>
          <div className="text-gray-400">
            {formatDuration(hoveredSeg.start)} → {formatDuration(hoveredSeg.end)}
            <span className="ml-2 text-gray-500">
              ({formatDuration(hoveredSeg.duration)})
            </span>
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-600" />
        </div>
      )}

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
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}
