import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSidecar } from "@/hooks/useSidecar";
import { save } from "@tauri-apps/plugin-dialog";
import ProgressBar from "@/components/ProgressBar";
import { buildExportRanges, formatTimecode } from "@/lib/timeRange";

export default function ExportPage() {
  const navigate = useNavigate();
  const { audioFile, job, segments, cropRange, startExport, reset } = useJobStore();
  const { settings } = useSettingsStore();
  const { sendCommand } = useSidecar();
  const [outputPath, setOutputPath] = useState<string>(
    job.outputPath || "",
  );

  const exportRanges = useMemo(
    () => buildExportRanges(segments, cropRange),
    [segments, cropRange],
  );
  const hasAudioToExport = exportRanges.length > 0;

  const handleChooseOutput = async () => {
    // Default to input filename with new extension
    let defaultName = `processed_output.${settings.outputFormat}`;
    if (audioFile?.name) {
      const baseName = audioFile.name.replace(/\.[^.]+$/, "");
      defaultName = `${baseName}.${settings.outputFormat}`;
    }

    try {
      const selected = await save({
        defaultPath: defaultName,
        filters: [
          { name: "Audio", extensions: [settings.outputFormat] },
        ],
      });
      if (selected) setOutputPath(selected);
    } catch (err) {
      console.error("[ExportPage] Save dialog error:", err);
    }
  };

  const handleExport = async () => {
    if (!audioFile || !hasAudioToExport) return;

    startExport();

    // Ensure output path has correct extension
    let finalOutputPath = outputPath;
    const fmt = settings.outputFormat;
    const ext = outputPath.split('.').pop()?.toLowerCase();
    if (ext !== fmt) {
      finalOutputPath = outputPath.replace(/\.[^.]+$/, `.${fmt}`);
      if (!finalOutputPath.includes('.')) finalOutputPath += `.${fmt}`;
    }

    try {
      await sendCommand("export", {
        inputPath: audioFile.path,
        outputPath: finalOutputPath,
        segments: exportRanges,
        format: fmt,
        enhancementStrength: settings.enhancementStrength,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Export failed unexpectedly";
      useJobStore.getState().setError(message);
    }
  };

  const handleStartOver = () => {
    reset();
    navigate("/");
  };

  const isExporting = job.status === "exporting";
  const isComplete = job.status === "complete";

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-gray-100">Export</h2>

      {/* Output path */}
      <div className="card w-full max-w-lg">
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Output File
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={outputPath}
            onChange={(e) => setOutputPath(e.target.value)}
            placeholder="Choose output location..."
            className="input-field flex-1 text-sm"
          />
          <button
            onClick={handleChooseOutput}
            className="btn-secondary shrink-0"
            disabled={isExporting}
          >
            Browse
          </button>
        </div>
      </div>

      {/* Crop summary */}
      {cropRange && (
        <div className="card w-full max-w-lg py-4">
          <p className="text-sm text-gray-400">
            Crop range{" "}
            <span className="font-mono text-sonic-300">
              {formatTimecode(cropRange.start)} → {formatTimecode(cropRange.end)}
            </span>{" "}
            <span className="text-gray-500">
              ({formatTimecode(cropRange.end - cropRange.start)})
            </span>
          </p>
        </div>
      )}

      {/* Nothing to export */}
      {!hasAudioToExport && !isExporting && !isComplete && (
        <div className="card w-full max-w-lg py-4 border-amber-700 bg-amber-900/20">
          <p className="text-amber-300 text-sm">
            {cropRange
              ? "No kept audio inside the crop range."
              : "No segments are marked to keep."}{" "}
            Go back to Review to adjust.
          </p>
        </div>
      )}

      {/* Progress during export */}
      {isExporting && (
        <div className="w-full max-w-lg">
          <ProgressBar
            percent={job.progress}
            label={job.phase}
            color="bg-sonic-500"
          />
        </div>
      )}

      {/* Success message */}
      {isComplete && (
        <div className="card w-full max-w-lg border-emerald-700 bg-emerald-900/20 text-center">
          <p className="text-emerald-400 text-lg font-semibold mb-2 flex items-center justify-center gap-2">
            <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="8" />
              <path d="M6.5 10.5l2 2L13.5 7.5" />
            </svg>
            Export Complete!
          </p>
          <p className="text-gray-300 text-sm break-all">
            {job.outputPath}
          </p>
        </div>
      )}

      {/* Error */}
      {job.status === "error" && (
        <div className="card w-full max-w-lg border-red-700 bg-red-900/20">
          <p className="text-red-400 font-medium">Export Failed</p>
          <p className="text-red-300 text-sm mt-1">{job.error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {!isComplete && !isExporting && (
          <button
            onClick={handleExport}
            disabled={!outputPath || isExporting || !hasAudioToExport}
            className="btn-primary px-8 py-3 text-lg"
          >
            <svg className="w-5 h-5 inline-block mr-1 -mt-0.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" />
              <path d="M10 13V3m0 0l4 4m-4-4L6 7" />
            </svg>
            Export
          </button>
        )}
        {isComplete && (
          <button onClick={handleStartOver} className="btn-secondary px-6">
            Start Over
          </button>
        )}
      </div>
    </div>
  );
}
