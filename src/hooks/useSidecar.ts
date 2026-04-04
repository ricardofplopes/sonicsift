import { useCallback } from "react";
import { useJobStore } from "@/stores/jobStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Segment, SidecarMessage } from "@/types";

/**
 * Set to `true` to use simulated responses (no Python needed).
 * Set to `false` to spawn the real Python backend via `invoke`.
 */
const MOCK_MODE = false;

/**
 * Custom hook to communicate with the Python backend.
 *
 * In real mode the Rust `run_python` command spawns `python -m sonicsift.main`,
 * sends a single JSON command on stdin, and returns all stdout once the process
 * exits.  Each stdout line is a newline-delimited JSON message that gets
 * translated into the frontend's `SidecarMessage` format.
 *
 * In mock mode it simulates sidecar responses for development without Python.
 */
export function useSidecar() {
  const handleMessage = useCallback((msg: SidecarMessage) => {
    const state = useJobStore.getState();
    const { payload } = msg;

    switch (msg.type) {
      case "progress": {
        const progress =
          typeof payload.progress === "number" ? payload.progress : undefined;
        if (progress === undefined) {
          console.warn("[sidecar] Invalid progress payload:", payload);
          break;
        }
        const phase =
          typeof payload.phase === "string" ? payload.phase : undefined;
        state.updateProgress(progress, phase);
        break;
      }
      case "log": {
        const level = payload.level;
        const message =
          typeof payload.message === "string" ? payload.message : undefined;
        if (
          (level !== "info" && level !== "warn" && level !== "error") ||
          message === undefined
        ) {
          console.warn("[sidecar] Invalid log payload:", payload);
          break;
        }
        state.addLog(level, message);
        break;
      }
      case "segments": {
        if (!Array.isArray(payload.segments)) {
          console.warn("[sidecar] Invalid segments payload:", payload);
          break;
        }
        state.setSegments(payload.segments as Segment[]);
        break;
      }
      case "complete": {
        const outputPath =
          typeof payload.outputPath === "string"
            ? payload.outputPath
            : undefined;
        if (outputPath === undefined) {
          console.warn("[sidecar] Invalid complete payload:", payload);
          break;
        }
        state.setComplete(outputPath);
        break;
      }
      case "fileInfo": {
        const state = useJobStore.getState();
        if (state.audioFile) {
          state.setAudioFile({
            ...state.audioFile,
            duration: (payload.duration as number) || state.audioFile.duration,
            sampleRate: (payload.sampleRate as number) || state.audioFile.sampleRate,
            channels: (payload.channels as number) || state.audioFile.channels,
            codec: (payload.codec as string) || state.audioFile.codec,
            size: (payload.fileSize as number) || state.audioFile.size,
          });
        }
        break;
      }
      case "error": {
        const errorMessage =
          typeof payload.message === "string"
            ? payload.message
            : "Unknown error";
        state.setError(errorMessage);
        break;
      }
      default:
        console.warn("[sidecar] Unknown message type:", msg.type);
    }
  }, []);

  const sendCommand = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      if (MOCK_MODE) {
        console.log("[sidecar mock] Sending:", JSON.stringify({ type, payload }));
        simulateMockResponse(type, payload, handleMessage);
        return;
      }

      // Build the JSON command that the Python backend expects.
      // The Python main loop reads `msg["command"]` (not `type`) and passes
      // `msg["payload"]` to the handler, which expects snake_case config keys.
      const pythonPayload = buildPythonPayload(type, payload);
      const commandJson = JSON.stringify({
        command: type,
        payload: pythonPayload,
      });

      console.log("[sidecar] Invoking Python with:", commandJson);

      // Set up real-time event listener BEFORE invoking
      const unlisten = await listen<string>("python-output", (event) => {
        const line = event.payload;
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line);
          const translated = translatePythonMessage(msg);
          if (translated) {
            handleMessage(translated);
          }
        } catch {
          // Non-JSON line, ignore
        }
      });

      try {
        await invoke<string>("run_python", { commandJson });
        // No need to parse result here - events already handled in real-time
      } catch (err) {
        console.error("[sidecar] Python invoke failed:", err);
        useJobStore.getState().setError(String(err));
      } finally {
        unlisten();
      }
    },
    [handleMessage],
  );

  const killSidecar = useCallback(async () => {
    // In invoke mode each command is a separate short-lived process — nothing
    // persistent to kill.
    console.log("[sidecar] Kill requested (no-op in invoke mode)");
  }, []);

  return { sendCommand, killSidecar, isReady: true };
}

// ---------------------------------------------------------------------------
// Python payload / message translation
// ---------------------------------------------------------------------------

/**
 * Map frontend payload fields to the format expected by the Python backend
 * (`filePath` instead of `inputPath`, settings nested under `config` with
 * snake_case keys, etc.).
 */
function buildPythonPayload(
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const jobId = useJobStore.getState().job.id || "";

  if (type === "probe") {
    return {
      jobId,
      filePath: payload.inputPath as string,
    };
  }

  if (type === "analyze") {
    return {
      jobId,
      filePath: payload.inputPath as string,
      config: {
        silence_threshold_db: payload.silenceThresholdDb,
        min_silence_duration: payload.minSilenceDuration,
        kept_padding_ms: payload.keptPaddingMs,
        enhancement_strength: payload.enhancementStrength,
        output_format: payload.outputFormat,
      },
    };
  }

  if (type === "export") {
    return {
      jobId,
      filePath: payload.inputPath as string,
      outputPath: payload.outputPath as string,
      segments: payload.segments,
      config: {
        output_format: (payload.format as string) || "wav",
        enhancement_strength: (payload.enhancementStrength as number) ?? 0.5,
      },
    };
  }

  return { jobId, ...payload };
}

/**
 * Translate a Python backend message (`analyzeResult`, `exportResult`,
 * `progress` with `percent`/`stage`) into the frontend `SidecarMessage`
 * format (`segments`, `complete`, `progress` with `progress`/`phase`).
 */
function translatePythonMessage(
  msg: Record<string, unknown>,
): SidecarMessage | null {
  const msgType = msg.type as string;
  const payload = (msg.payload || {}) as Record<string, unknown>;

  switch (msgType) {
    case "progress":
      return {
        type: "progress",
        payload: {
          progress: payload.percent as number,
          phase: payload.stage as string,
        },
      };

    case "probeResult":
      return {
        type: "fileInfo",
        payload: {
          duration: payload.duration as number,
          sampleRate: payload.sampleRate as number,
          channels: payload.channels as number,
          codec: payload.codec as string,
          fileSize: payload.fileSize as number,
        },
      };

    case "analyzeResult":
      return {
        type: "segments",
        payload: {
          segments: payload.segments,
        },
      };

    case "exportResult":
      return {
        type: "complete",
        payload: {
          outputPath: payload.outputPath as string,
        },
      };

    case "error":
      return {
        type: "error",
        payload: {
          message: payload.message as string,
        },
      };

    case "pong":
    case "cancelled":
      console.log(`[sidecar] Received ${msgType}`);
      return null;

    default:
      console.warn("[sidecar] Unknown Python message type:", msgType);
      return null;
  }
}

// ---------------------------------------------------------------------------
// Mock helpers — simulate sidecar responses for development
// ---------------------------------------------------------------------------

function simulateMockResponse(
  type: string,
  payload: Record<string, unknown>,
  dispatch: (msg: SidecarMessage) => void,
) {
  if (type === "analyze") {
    const duration = (payload.duration as number) || 120;
    let progress = 0;
    const phases = [
      "Loading audio...",
      "Detecting silence...",
      "Classifying segments...",
      "Finalizing...",
    ];

    const interval = setInterval(() => {
      progress += 5;
      const phaseIdx = Math.min(
        Math.floor((progress / 100) * phases.length),
        phases.length - 1,
      );
      dispatch({
        type: "progress",
        payload: { progress, phase: phases[phaseIdx] },
      });
      dispatch({
        type: "log",
        payload: {
          level: "info",
          message: `${phases[phaseIdx]} (${progress}%)`,
        },
      });

      if (progress >= 100) {
        clearInterval(interval);
        const segments = generateMockSegments(duration);
        dispatch({ type: "segments", payload: { segments } });
      }
    }, 300);
  } else if (type === "export") {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      dispatch({
        type: "progress",
        payload: { progress, phase: "Exporting audio..." },
      });

      if (progress >= 100) {
        clearInterval(interval);
        const dir = (payload.inputPath as string) || "C:\\output";
        dispatch({
          type: "complete",
          payload: { outputPath: `${dir}\\output_processed.wav` },
        });
      }
    }, 250);
  }
}

function generateMockSegments(totalDuration: number): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < totalDuration) {
    const isSpeech = segments.length % 2 === 0;
    const dur = isSpeech
      ? 3 + Math.random() * 12
      : 0.5 + Math.random() * 3;
    const end = Math.min(cursor + dur, totalDuration);

    segments.push({
      start: Math.round(cursor * 100) / 100,
      end: Math.round(end * 100) / 100,
      duration: Math.round((end - cursor) * 100) / 100,
      segmentType: isSpeech ? "speech" : "silence",
      keep: isSpeech,
    });

    cursor = end;
  }

  return segments;
}
