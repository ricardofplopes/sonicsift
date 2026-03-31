import { create } from "zustand";
import type { AudioFile, JobState, LogEntry, Segment } from "@/types";

function createEmptyJob(): JobState {
  return {
    id: "",
    status: "idle",
    phase: "",
    progress: 0,
    logs: [],
    outputPath: null,
    error: null,
  };
}

function makeLog(
  level: LogEntry["level"],
  message: string,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

interface JobStore {
  audioFile: AudioFile | null;
  job: JobState;
  segments: Segment[];

  setAudioFile: (file: AudioFile) => void;
  startAnalysis: () => void;
  updateProgress: (progress: number, phase?: string) => void;
  setSegments: (segments: Segment[]) => void;
  toggleSegmentKeep: (index: number) => void;
  startExport: () => void;
  setComplete: (outputPath: string) => void;
  setError: (error: string) => void;
  addLog: (level: LogEntry["level"], message: string) => void;
  reset: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  audioFile: null,
  job: createEmptyJob(),
  segments: [],

  setAudioFile: (file) =>
    set({
      audioFile: file,
      job: { ...createEmptyJob(), status: "idle" },
      segments: [],
    }),

  startAnalysis: () =>
    set((state) => ({
      job: {
        ...state.job,
        id: crypto.randomUUID(),
        status: "analyzing",
        phase: "Analyzing audio...",
        progress: 0,
        error: null,
        logs: [
          ...state.job.logs,
          makeLog("info", "Analysis started"),
        ],
      },
      segments: [],
    })),

  updateProgress: (progress, phase) =>
    set((state) => ({
      job: {
        ...state.job,
        progress,
        ...(phase ? { phase } : {}),
      },
    })),

  setSegments: (segments) =>
    set((state) => ({
      segments,
      job: {
        ...state.job,
        status: "reviewing",
        phase: "Review segments",
        progress: 100,
        logs: [
          ...state.job.logs,
          makeLog("info", `Detected ${segments.length} segments`),
        ],
      },
    })),

  toggleSegmentKeep: (index) =>
    set((state) => ({
      segments: state.segments.map((seg, i) =>
        i === index ? { ...seg, keep: !seg.keep } : seg,
      ),
    })),

  startExport: () =>
    set((state) => ({
      job: {
        ...state.job,
        status: "exporting",
        phase: "Exporting audio...",
        progress: 0,
        error: null,
        logs: [
          ...state.job.logs,
          makeLog("info", "Export started"),
        ],
      },
    })),

  setComplete: (outputPath) =>
    set((state) => ({
      job: {
        ...state.job,
        status: "complete",
        phase: "Complete",
        progress: 100,
        outputPath,
        logs: [
          ...state.job.logs,
          makeLog("info", `Export complete: ${outputPath}`),
        ],
      },
    })),

  setError: (error) =>
    set((state) => ({
      job: {
        ...state.job,
        status: "error",
        error,
        logs: [
          ...state.job.logs,
          makeLog("error", error),
        ],
      },
    })),

  addLog: (level, message) =>
    set((state) => ({
      job: {
        ...state.job,
        logs: [...state.job.logs, makeLog(level, message)],
      },
    })),

  reset: () =>
    set({
      audioFile: null,
      job: createEmptyJob(),
      segments: [],
    }),
}));
