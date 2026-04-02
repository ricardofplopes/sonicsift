import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import Logo from "@/components/Logo";
import { open } from "@tauri-apps/plugin-dialog";
import type { AudioFile } from "@/types";

function extractFileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

export default function ImportPage() {
  const navigate = useNavigate();
  const { audioFile, setAudioFile } = useJobStore();
  const [isDragging, setIsDragging] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);

  const handleChooseFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Audio",
            extensions: ["wav", "mp3", "flac", "ogg", "aac", "m4a", "wma"],
          },
        ],
      });
      if (!selected) return;

      const filePath = selected as string;
      const fileName = extractFileName(filePath);

      // Real metadata (duration, sample rate, etc.) will come from
      // the Python sidecar later; use placeholders for now.
      const file: AudioFile = {
        path: filePath,
        name: fileName,
        size: 0,
        duration: 0,
        sampleRate: 0,
        channels: 0,
        codec: "unknown",
      };
      setAudioFile(file);
      setDropMessage(null);
    } catch (err) {
      console.error("[ImportPage] File dialog error:", err);
    }
  }, [setAudioFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        const filePath = (file as any).path || file.name;
        const fileName = file.name;
        const supportedExts = ['wav', 'mp3', 'flac', 'ogg', 'aac', 'm4a', 'wma'];
        const ext = fileName.split('.').pop()?.toLowerCase() || '';

        if (!supportedExts.includes(ext)) {
          setDropMessage(`Unsupported format: .${ext}`);
          return;
        }

        const audioFile: AudioFile = {
          path: filePath,
          name: fileName,
          size: file.size,
          duration: 0,
          sampleRate: 0,
          channels: 0,
          codec: ext,
        };
        setAudioFile(audioFile);
        setDropMessage(null);
      }
    },
    [setAudioFile],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 animate-fade-in">
      <Logo size="lg" />
      <p className="text-sm text-gray-500 -mt-4 tracking-widest uppercase">
        Process · Clean · Export
      </p>
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
          relative w-full max-w-lg h-56 rounded-xl border-2 border-dashed overflow-hidden
          flex flex-col items-center justify-center gap-3 cursor-pointer
          transition-all duration-300
          ${
            isDragging
              ? "border-sonic-400 bg-sonic-600/10 animate-pulse-border scale-[1.01] shadow-[0_0_20px_rgba(61,107,255,0.15)]"
              : "border-gray-600 hover:border-gray-500 hover:brightness-110 bg-gray-800/50 active:scale-[0.98]"
          }
        `}
        onClick={handleChooseFile}
      >
        {/* Waveform background decoration */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04] pointer-events-none"
          viewBox="0 0 400 200"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 60 }, (_, i) => {
            const h = 30 + Math.sin(i * 0.7) * 25 + Math.sin(i * 1.3) * 15;
            return (
              <rect
                key={i}
                x={i * 6.7}
                y={100 - h / 2}
                width={4}
                height={h}
                rx={2}
                fill="currentColor"
              />
            );
          })}
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
            isDragging
              ? "bg-sonic-600/30 scale-110"
              : "bg-gray-700/50"
          }`}>
            {isDragging ? (
              <svg className="w-8 h-8 text-sonic-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17h14" />
                <path d="M10 3v10m0 0l-4-4m4 4l4-4" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            )}
          </div>
          <span className="text-gray-200 font-semibold text-lg">
            {isDragging ? "Release to import" : "Drop your audio file here"}
          </span>
          <span className="text-gray-500 text-sm">
            {isDragging ? "" : "or click anywhere to browse"}
          </span>
        </div>
      </div>

      {/* Supported formats */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-gray-500">
        <span>Supported formats:</span>
        {["WAV", "MP3", "FLAC", "OGG", "M4A", "AAC"].map((fmt) => (
          <span
            key={fmt}
            className="px-2 py-0.5 bg-gray-800 rounded text-gray-400 font-mono"
          >
            .{fmt.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Drag-drop notice */}
      {dropMessage && (
        <p className="text-yellow-400 text-sm max-w-lg text-center">
          {dropMessage}
        </p>
      )}

      {/* File info */}
      {audioFile && (
        <div className="card w-full max-w-lg animate-slide-in">
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
        <span className="text-xs opacity-60 ml-2">(Ctrl+Enter)</span>
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
