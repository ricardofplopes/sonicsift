import { useNavigate } from "react-router-dom";
import { useSettingsStore } from "@/stores/settingsStore";
import { useJobStore } from "@/stores/jobStore";
import { useSidecar } from "@/hooks/useSidecar";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, updateSetting, resetDefaults } = useSettingsStore();
  const { audioFile, startAnalysis } = useJobStore();
  const { sendCommand } = useSidecar();

  const handleStartAnalysis = async () => {
    if (!audioFile) return;

    startAnalysis();
    navigate("/progress");

    // TODO: Wire to actual sidecar once Rust backend is built
    await sendCommand("analyze", {
      inputPath: audioFile.path,
      duration: audioFile.duration,
      ...settings,
    });
  };

  return (
    <div className="flex flex-col h-full p-8 overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-100 mb-2">
        Processing Settings
      </h2>
      <p className="text-gray-400 mb-8">
        Fine-tune how SonicSift detects and removes silence.
      </p>

      <div className="space-y-6 max-w-xl">
        {/* Silence Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Silence Threshold:{" "}
            <span className="text-sonic-400 font-mono">
              {settings.silenceThresholdDb} dB
            </span>
          </label>
          <input
            type="range"
            min={-60}
            max={-10}
            step={1}
            value={settings.silenceThresholdDb}
            onChange={(e) =>
              updateSetting("silenceThresholdDb", Number(e.target.value))
            }
            className="w-full accent-sonic-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>-60 dB (sensitive)</span>
            <span>-10 dB (aggressive)</span>
          </div>
        </div>

        {/* Min Silence Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Min Silence Duration:{" "}
            <span className="text-sonic-400 font-mono">
              {settings.minSilenceDuration.toFixed(1)}s
            </span>
          </label>
          <input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={settings.minSilenceDuration}
            onChange={(e) =>
              updateSetting("minSilenceDuration", Number(e.target.value))
            }
            className="input-field w-40"
          />
          <p className="text-xs text-gray-500 mt-1">
            Gaps shorter than this are kept as speech.
          </p>
        </div>

        {/* Kept Padding */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Kept Padding:{" "}
            <span className="text-sonic-400 font-mono">
              {settings.keptPaddingMs} ms
            </span>
          </label>
          <input
            type="number"
            min={0}
            max={2000}
            step={10}
            value={settings.keptPaddingMs}
            onChange={(e) =>
              updateSetting("keptPaddingMs", Number(e.target.value))
            }
            className="input-field w-40"
          />
          <p className="text-xs text-gray-500 mt-1">
            Silence padding kept around speech segments for natural transitions.
          </p>
        </div>

        {/* Enhancement Strength */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Enhancement Strength:{" "}
            <span className="text-sonic-400 font-mono">
              {settings.enhancementStrength.toFixed(2)}
            </span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.enhancementStrength}
            onChange={(e) =>
              updateSetting("enhancementStrength", Number(e.target.value))
            }
            className="w-full accent-sonic-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0 (none)</span>
            <span>1 (maximum)</span>
          </div>
        </div>

        {/* Output Format */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Output Format
          </label>
          <select
            value={settings.outputFormat}
            onChange={(e) =>
              updateSetting(
                "outputFormat",
                e.target.value as "wav" | "mp3" | "flac",
              )
            }
            className="input-field w-40"
          >
            <option value="wav">WAV</option>
            <option value="mp3">MP3</option>
            <option value="flac">FLAC</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-10">
        <button onClick={resetDefaults} className="btn-secondary">
          Reset to Defaults
        </button>
        <button
          onClick={handleStartAnalysis}
          disabled={!audioFile}
          className="btn-primary px-6"
        >
          Start Analysis ▶
        </button>
      </div>
    </div>
  );
}
