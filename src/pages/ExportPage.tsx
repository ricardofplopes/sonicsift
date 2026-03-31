import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useSidecar } from "@/hooks/useSidecar";
import ProgressBar from "@/components/ProgressBar";

// TODO: Wire to actual Tauri dialog once Rust backend is built
// import { save } from "@tauri-apps/plugin-dialog";

export default function ExportPage() {
  const navigate = useNavigate();
  const { audioFile, job, segments, startExport, reset } = useJobStore();
  const { settings } = useSettingsStore();
  const { sendCommand } = useSidecar();
  const [outputPath, setOutputPath] = useState<string>(
    job.outputPath || "",
  );

  const handleChooseOutput = async () => {
    // TODO: Wire to actual Tauri save dialog once Rust backend is built
    // const selected = await save({
    //   defaultPath: `processed_output.${settings.outputFormat}`,
    //   filters: [{ name: "Audio", extensions: [settings.outputFormat] }],
    // });
    // if (selected) setOutputPath(selected);

    // Mock path for development
    setOutputPath(`C:\\Users\\demo\\Music\\processed_output.${settings.outputFormat}`);
  };

  const handleExport = async () => {
    if (!audioFile) return;

    startExport();

    const keptSegments = segments
      .filter((s) => s.keep)
      .map((s) => ({ start: s.start, end: s.end }));

    // TODO: Wire to actual sidecar once Rust backend is built
    await sendCommand("export", {
      inputPath: audioFile.path,
      outputPath,
      segments: keptSegments,
      format: settings.outputFormat,
      enhancementStrength: settings.enhancementStrength,
    });
  };

  const handleStartOver = () => {
    reset();
    navigate("/");
  };

  const isExporting = job.status === "exporting";
  const isComplete = job.status === "complete";

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
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
          <p className="text-emerald-400 text-lg font-semibold mb-2">
            ✅ Export Complete!
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
            disabled={!outputPath || isExporting}
            className="btn-primary px-8 py-3 text-lg"
          >
            Export 💾
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
