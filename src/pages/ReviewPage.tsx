import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import SegmentTimeline from "@/components/SegmentTimeline";

export default function ReviewPage() {
  const navigate = useNavigate();
  const { audioFile, segments, toggleSegmentKeep } = useJobStore();

  const totalDuration = audioFile?.duration ?? 0;

  const speechSegments = segments.filter((s) => s.segmentType === "speech");
  const silenceSegments = segments.filter((s) => s.segmentType === "silence");
  const keptSegments = segments.filter((s) => s.keep);
  const estimatedOutput = keptSegments.reduce((sum, s) => sum + s.duration, 0);

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

  return (
    <div className="flex flex-col h-full p-8 overflow-y-auto gap-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100">Review Segments</h2>
      <p className="text-gray-400">
        Click segments in the timeline to toggle keep / discard. Green = kept,
        red = discarded.
      </p>

      {/* Timeline */}
      <SegmentTimeline
        segments={segments}
        totalDuration={totalDuration}
        onToggle={toggleSegmentKeep}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Segments" value={segments.length} />
        <StatCard label="Speech" value={speechSegments.length} color="text-emerald-400" />
        <StatCard label="Silence" value={silenceSegments.length} color="text-red-400" />
        <StatCard
          label="Est. Output"
          value={formatDuration(estimatedOutput)}
          color="text-sonic-400"
        />
      </div>

      {/* Bulk actions - segmented toggle */}
      <div className="flex gap-0.5 bg-gray-800 p-1 rounded-lg">
        <button
          onClick={handleKeepAll}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            allKept
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5l4 4L16 6" />
            </svg>
            Keep All
          </span>
        </button>
        <button
          onClick={handleDiscardAllSilence}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            allSilenceDiscarded
              ? "bg-red-600 text-white shadow-sm"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
          }`}
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4l8 12M14 4L6 16" />
            </svg>
            Discard All Silence
          </span>
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
