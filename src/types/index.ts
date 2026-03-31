export interface AudioFile {
  path: string;
  name: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  codec: string;
}

export interface Segment {
  start: number;
  end: number;
  duration: number;
  segmentType: "speech" | "silence";
  keep: boolean;
}

export interface ProcessingSettings {
  silenceThresholdDb: number;
  minSilenceDuration: number;
  keptPaddingMs: number;
  enhancementStrength: number;
  outputFormat: "wav" | "mp3" | "flac";
}

export interface JobState {
  id: string;
  status:
    | "idle"
    | "analyzing"
    | "reviewing"
    | "exporting"
    | "complete"
    | "error";
  phase: string;
  progress: number;
  logs: LogEntry[];
  outputPath: string | null;
  error: string | null;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface SidecarMessage {
  type: string;
  payload: Record<string, unknown>;
}
