import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import type { AudioFile } from "@/types";

// TODO: Wire to actual Tauri dialog once Rust backend is built
// import { open } from "@tauri-apps/plugin-dialog";

export default function ImportPage() {
  const navigate = useNavigate();
  const { audioFile, setAudioFile } = useJobStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleChooseFile = useCallback(async () => {
    // TODO: Wire to actual Tauri dialog once Rust backend is built
    // const selected = await open({
    //   filters: [{ name: "Audio", extensions: ["wav", "mp3", "flac", "ogg", "m4a", "aac"] }],
    //   multiple: false,
    // });
    // if (!selected) return;
    // const filePath = selected as string;

    // Mock file for development
    const mockFile: AudioFile = {
      path: "C:\\Users\\demo\\Music\\podcast_episode_42.wav",
      name: "podcast_episode_42.wav",
      size: 256_000_000,
      duration: 3720,
      sampleRate: 44100,
      channels: 2,
      codec: "PCM 16-bit",
    };
    setAudioFile(mockFile);
  }, [setAudioFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      // TODO: Wire to actual file drop handling
      // In Tauri, drag-and-drop gives us file paths — parse them here
      console.log("Dropped files:", e.dataTransfer.files);

      // Mock for dev
      handleChooseFile();
    },
    [handleChooseFile],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <h2 className="text-2xl font-bold text-gray-100">Import Audio File</h2>
      <p className="text-gray-400 text-center max-w-md">
        Drop a large audio file (podcast, lecture, interview) to get started.
        SonicSift will detect silence and let you review before exporting.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`
          w-full max-w-lg h-56 rounded-xl border-2 border-dashed
          flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer
          ${
            isDragging
              ? "border-sonic-400 bg-sonic-600/10"
              : "border-gray-600 hover:border-gray-500 bg-gray-800/50"
          }
        `}
        onClick={handleChooseFile}
      >
        <span className="text-5xl">📂</span>
        <span className="text-gray-300 font-medium">
          Drag & drop audio file here
        </span>
        <span className="text-gray-500 text-sm">
          or click to browse
        </span>
        <span className="text-gray-600 text-xs">
          WAV · MP3 · FLAC · OGG · M4A · AAC
        </span>
      </div>

      {/* File info */}
      {audioFile && (
        <div className="card w-full max-w-lg">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Selected File
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="Name" value={audioFile.name} />
            <InfoRow label="Format" value={audioFile.codec} />
            <InfoRow label="Duration" value={formatDuration(audioFile.duration)} />
            <InfoRow label="Size" value={formatFileSize(audioFile.size)} />
            <InfoRow label="Sample Rate" value={`${audioFile.sampleRate} Hz`} />
            <InfoRow label="Channels" value={audioFile.channels === 1 ? "Mono" : "Stereo"} />
          </div>
        </div>
      )}

      {/* Continue */}
      <button
        disabled={!audioFile}
        onClick={() => navigate("/settings")}
        className="btn-primary px-8 py-3 text-lg"
      >
        Continue →
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <p className="text-gray-200 font-medium truncate">{value}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000).toFixed(0)} KB`;
}
