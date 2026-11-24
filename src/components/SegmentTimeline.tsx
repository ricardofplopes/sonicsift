import { memo, useState, useRef } from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import type { Segment, TimeRange } from "@/types";
import { formatTimecode, moveRangeEdge } from "@/lib/timeRange";

type CropEdge = "start" | "end";

interface HoverInfo {
  index: number;
  left: number;
  top: number;
}

interface SegmentTimelineProps {
  segments: Segment[];
  totalDuration: number;
  onToggle: (index: number) => void;
  /** Current crop; `null` means the whole file. */
  cropRange?: TimeRange | null;
  /** When provided, draggable crop handles are shown on the timeline. */
  onCropChange?: (range: TimeRange) => void;
}

export default function SegmentTimeline({
  segments,
  totalDuration,
  onToggle,
  cropRange = null,
  onCropChange,
}: SegmentTimelineProps) {
  const [hovered, setHovered] = useState<HoverInfo | null>(null);
  const [dragging, setDragging] = useState<CropEdge | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  if (totalDuration === 0) return null;

  const hoveredSeg = hovered !== null ? segments[hovered.index] : null;
  const range = cropRange ?? { start: 0, end: totalDuration };
  const startPct = (range.start / totalDuration) * 100;
  const endPct = (range.end / totalDuration) * 100;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>, edge: CropEdge) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    setHovered(null);
    setDragging(edge);
  };

  const updateEdge = (edge: CropEdge, time: number) => {
    if (!onCropChange) return;
    const next = moveRangeEdge(range, edge, time, totalDuration);
    if (next.start !== range.start || next.end !== range.end) {
      onCropChange(next);
    }
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>, edge: CropEdge) => {
    if (dragging !== edge || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    updateEdge(edge, ((e.clientX - rect.left) / rect.width) * totalDuration);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, edge: CropEdge) => {
    const step = e.shiftKey ? 60 : 1;
    const current = range[edge];
    let time: number;
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        time = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        time = current + step;
        break;
      case "Home":
        time = 0;
        break;
      case "End":
        time = totalDuration;
        break;
      default:
        return;
    }
    e.preventDefault();
    updateEdge(edge, time);
  };

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

      {/* Track: waveform + timeline bar, with crop overlay and handles on top */}
      <div className="relative" ref={trackRef}>
        <SegmentTrack
          segments={segments}
          totalDuration={totalDuration}
          onToggle={onToggle}
          onHover={setHovered}
          containerRef={containerRef}
        />

        {onCropChange && (
          <>
            {/* Dim everything outside the crop range (clicks pass through) */}
            <div
              className="absolute inset-y-0 left-0 bg-gray-950/70 pointer-events-none rounded-l-lg"
              style={{ width: `${startPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 bg-gray-950/70 pointer-events-none rounded-r-lg"
              style={{ width: `${100 - endPct}%` }}
            />

            {(["start", "end"] as const).map((edge) => {
              const value = range[edge];
              const pct = edge === "start" ? startPct : endPct;
              return (
                <div
                  key={edge}
                  role="slider"
                  tabIndex={0}
                  aria-label={edge === "start" ? "Crop start" : "Crop end"}
                  aria-valuemin={0}
                  aria-valuemax={Math.round(totalDuration)}
                  aria-valuenow={Math.round(value)}
                  aria-valuetext={formatTimecode(value)}
                  className="group absolute inset-y-0 z-20 w-3 -translate-x-1/2 flex justify-center cursor-ew-resize touch-none outline-none"
                  style={{ left: `${pct}%` }}
                  onPointerDown={(e) => handlePointerDown(e, edge)}
                  onPointerMove={(e) => handlePointerMove(e, edge)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => handleKeyDown(e, edge)}
                >
                  <div
                    className={`w-0.5 h-full transition-colors ${
                      dragging === edge
                        ? "bg-sonic-300"
                        : "bg-sonic-400 group-hover:bg-sonic-300 group-focus-visible:bg-sonic-300"
                    }`}
                  />
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-3 h-6 rounded-sm border flex items-center justify-center gap-px transition-colors ${
                      dragging === edge
                        ? "bg-sonic-500 border-sonic-300"
                        : "bg-sonic-600 border-sonic-400 group-hover:bg-sonic-500 group-focus-visible:ring-2 group-focus-visible:ring-sonic-300"
                    }`}
                  >
                    <span className="w-px h-3 bg-sonic-100/80" />
                    <span className="w-px h-3 bg-sonic-100/80" />
                  </div>
                  <div
                    className={`absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-gray-800 border border-sonic-500 text-[10px] font-mono text-sonic-200 whitespace-nowrap pointer-events-none ${
                      dragging === edge ? "block" : "hidden group-focus-visible:block"
                    }`}
                  >
                    {formatTimecode(value)}
                  </div>
                </div>
              );
            })}
          </>
        )}
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

interface SegmentTrackProps {
  segments: Segment[];
  totalDuration: number;
  onToggle: (index: number) => void;
  onHover: (info: HoverInfo | null) => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

/** Waveform + clickable segment bar. Memoized so crop drags don't re-render every segment. */
const SegmentTrack = memo(function SegmentTrack({
  segments,
  totalDuration,
  onToggle,
  onHover,
  containerRef,
}: SegmentTrackProps) {
  return (
    <>
      {/* Waveform visualization. Segments are absolutely positioned by time so the track stays
          linear (and aligned with the crop handles) even with thousands of tiny segments. */}
      <div className="relative w-full h-16 rounded-t-lg overflow-hidden border border-b-0 border-gray-700 bg-gray-900/80">
        {segments.map((seg, i) => {
          const leftPercent = (seg.start / totalDuration) * 100;
          const widthPercent = (seg.duration / totalDuration) * 100;
          const barCount = widthPercent < 0.2 ? 1 : Math.max(2, Math.round(widthPercent * 0.8));
          const isSpeech = seg.segmentType === "speech";
          const opacity = seg.keep ? 1 : 0.25;

          return (
            <div
              key={`wf-${i}`}
              className="absolute inset-y-0 flex items-end gap-px overflow-hidden cursor-pointer"
              style={{ left: `${leftPercent}%`, width: `${widthPercent}%`, minWidth: "1px", opacity }}
              onClick={() => onToggle(i)}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const cRect = containerRef.current?.getBoundingClientRect();
                if (cRect) {
                  onHover({
                    index: i,
                    left: rect.left - cRect.left + rect.width / 2,
                    top: rect.top - cRect.top,
                  });
                }
              }}
              onMouseLeave={() => onHover(null)}
            >
              {Array.from({ length: barCount }, (_, j) => {
                const seed = (i * 127 + j * 31) % 100;
                const baseHeight = isSpeech ? 30 + seed * 0.6 : 5 + seed * 0.12;
                const height = Math.min(95, Math.max(4, baseHeight));
                const color = isSpeech
                  ? seg.keep ? "bg-emerald-500" : "bg-red-500"
                  : seg.keep ? "bg-emerald-800" : "bg-red-900";

                return (
                  <div
                    key={j}
                    className={`flex-1 min-w-[1px] rounded-t-sm ${color} transition-all duration-200`}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Timeline bar */}
      <div className="relative w-full h-10 rounded-b-lg overflow-hidden border border-t-0 border-gray-700 bg-gray-900">
        {segments.map((seg, i) => {
          const leftPercent = (seg.start / totalDuration) * 100;
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
                  onHover({
                    index: i,
                    left: rect.left - cRect.left + rect.width / 2,
                    top: rect.top - cRect.top,
                  });
                }
              }}
              onMouseLeave={() => onHover(null)}
              className={`absolute inset-y-0 cursor-pointer ${
                widthPercent > 0.5 ? "border-r border-gray-800 last:border-r-0" : ""
              } transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_12px_rgba(255,255,255,0.1)] hover:z-10 ${bgColor}`}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                minWidth: widthPercent > 0.5 ? "2px" : "1px",
              }}
            />
          );
        })}
      </div>
    </>
  );
});

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}
