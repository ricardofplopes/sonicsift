import { useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import SegmentTimeline from "@/components/SegmentTimeline";
import SpeechDensityBar from "@/components/SpeechDensityBar";
import type { TimeRange } from "@/types";
import {
  buildExportRanges,
  clampRange,
  clipSegmentsToRange,
  formatTimecode,
  getTimelineDuration,
  isFullRange,
  parseTimecode,
} from "@/lib/timeRange";

export default function ReviewPage() {
  const navigate = useNavigate();
  const { audioFile, segments, cropRange, toggleSegmentKeep, setCropRange } =
    useJobStore();

  const totalDuration = getTimelineDuration(audioFile?.duration ?? 0, segments);
  const range = cropRange ?? { start: 0, end: totalDuration };

  const segmentsInRange = useMemo(
    () => clipSegmentsToRange(segments, cropRange),
    [segments, cropRange],
  );
  const estimatedOutput = useMemo(
    () =>
      buildExportRanges(segments, cropRange).reduce(
        (sum, r) => sum + (r.end - r.start),
        0,
      ),
    [segments, cropRange],
  );

  const speechSegments = segmentsInRange.filter((s) => s.segmentType === "speech");
  const silenceSegments = segmentsInRange.filter((s) => s.segmentType === "silence");

  const allKept = segments.length > 0 && segments.every(s => s.keep);
  const allSilenceDiscarded = segments.length > 0 &&
    segments.every(s => s.segmentType === "speech" ? s.keep : !s.keep);

  const handleKeepAll = () => {
    segments.forEach((_, i) => {
      if (!segments[i].keep) toggleSegmentKeep(i);
    });
  };

  const handleDiscardAllSilence = () => {
    segments.forEach((seg, i) => {
      if (seg.segmentType === "silence" && seg.keep) toggleSegmentKeep(i);
      if (seg.segmentType === "speech" && !seg.keep) toggleSegmentKeep(i);
    });
  };

  const handleCropChange = (next: TimeRange) => {
    setCropRange(isFullRange(next, totalDuration) ? null : next);
  };

  const handleCropInput = (edge: keyof TimeRange, seconds: number) => {
    handleCropChange(clampRange({ ...range, [edge]: seconds }, totalDuration));
  };

  return (
    <div className="flex flex-col h-full p-8 overflow-y-auto gap-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100">Review Segments</h2>
      <p className="text-gray-400">
        Click segments in the timeline to toggle keep / discard. Green = kept,
        red = discarded. Drag the blue handles (or type times below) to crop
        the export to part of the file.
      </p>

      {/* Speech density + timeline */}
      <div className="flex flex-col gap-4">
        <SpeechDensityBar
          segments={segments}
          totalDuration={totalDuration}
          cropRange={cropRange}
        />
        <SegmentTimeline
          segments={segments}
          totalDuration={totalDuration}
          onToggle={toggleSegmentKeep}
          cropRange={cropRange}
          onCropChange={handleCropChange}
        />
      </div>

      {/* Crop range */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Crop Range</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Only kept audio inside this range is exported. Type H:MM:SS,
              M:SS, or a number of minutes.
            </p>
          </div>
          <button
            onClick={() => setCropRange(null)}
            disabled={!cropRange}
            className="btn-secondary text-sm shrink-0"
          >
            Reset to Full
          </button>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <TimeInput
            label="Start"
            value={range.start}
            onCommit={(s) => handleCropInput("start", s)}
          />
          <TimeInput
            label="End"
            value={range.end}
            onCommit={(s) => handleCropInput("end", s)}
          />
          <div>
            <span className="block text-xs text-gray-500 mb-1">Length</span>
            <span className="block py-2 font-mono text-sm text-sonic-300">
              {formatTimecode(range.end - range.start)}
              <span className="text-gray-500"> of {formatTimecode(totalDuration)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={cropRange ? "Segments in Range" : "Total Segments"}
          value={segmentsInRange.length}
        />
        <StatCard label="Speech" value={speechSegments.length} color="text-emerald-400" />
        <StatCard label="Silence" value={silenceSegments.length} color="text-red-400" />
        <StatCard
          label="Est. Output"
          value={formatDuration(estimatedOutput)}
          color="text-sonic-400"
        />
      </div>

      {/* Bulk actions */}
      <div className="flex gap-3">
        <button
          onClick={handleKeepAll}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
            allKept
              ? "bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
              : "border-gray-700 text-gray-400 hover:border-emerald-600/50 hover:text-emerald-400 hover:bg-emerald-600/5"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10.5l4 4L16 6" />
          </svg>
          Keep All
        </button>
        <button
          onClick={handleDiscardAllSilence}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border ${
            allSilenceDiscarded
              ? "bg-red-600/20 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.15)]"
              : "border-gray-700 text-gray-400 hover:border-red-600/50 hover:text-red-400 hover:bg-red-600/5"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4l8 12M14 4L6 16" />
          </svg>
          Discard All Silence
        </button>
      </div>

      {/* Navigate to export */}
      <div className="mt-auto pt-4">
        <button
          onClick={() => navigate("/export")}
          className="btn-primary px-8 py-3 text-lg"
        >
          Export →
        </button>
      </div>
    </div>
  );
}

function TimeInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (seconds: number) => void;
}) {
  // Text being edited; null shows the committed value as H:MM:SS.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const commit = () => {
    if (draft === null) return;
    const seconds = parseTimecode(draft);
    if (seconds === null) {
      setError(`Couldn't read "${draft.trim()}"`);
    } else {
      setError(null);
      onCommit(seconds);
    }
    setDraft(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-xs text-gray-500 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={draft ?? formatTimecode(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`input-field w-32 font-mono text-sm ${
          error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""
        }`}
      />
      {error && (
        <span id={`${id}-error`} className="block text-xs text-red-400 mt-1">
          {error}
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-gray-100",
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card text-center">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
