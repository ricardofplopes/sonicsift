import { useCallback, useRef, useState } from "react";
import { useJobStore } from "@/stores/jobStore";
import { Command } from "@tauri-apps/plugin-shell";
import type { Segment, SidecarMessage } from "@/types";

/**
 * Set to `false` once the Python sidecar binary is bundled at
 * `src-tauri/binaries/sonicsift-worker-<target-triple>[.exe]`.
 */
const MOCK_MODE = true;

interface ChildProcess {
  write(data: string): Promise<void>;
  kill(): Promise<void>;
  pid: number;
}

/**
 * Custom hook to communicate with the Python sidecar via JSON-over-stdio.
 *
 * In mock mode, it simulates sidecar responses for development without a
 * compiled Rust backend / Python worker.
 */
export function useSidecar() {
  const [isReady, setIsReady] = useState(false);
  const [mockFallback, setMockFallback] = useState(false);
  const childRef = useRef<ChildProcess | null>(null);
  const isMocked = MOCK_MODE || mockFallback;

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

  const spawnSidecar = useCallback(async () => {
    if (childRef.current) return;

    if (MOCK_MODE) {
      console.log("[sidecar] Running in mock mode");
      setIsReady(true);
      return;
    }

    try {
      const command = Command.sidecar("binaries/sonicsift-worker");

      command.stdout.on("data", (line: string) => {
        try {
          const msg: SidecarMessage = JSON.parse(line);
          handleMessage(msg);
        } catch {
          console.warn("[sidecar] Non-JSON stdout:", line);
        }
      });

      command.stderr.on("data", (line: string) => {
        console.error("[sidecar stderr]", line);
        useJobStore.getState().addLog("warn", `[stderr] ${line}`);
      });

      command.on("close", (data) => {
        console.log("[sidecar] Exited with code:", data.code);
        childRef.current = null;
        setIsReady(false);
      });

      const child = await command.spawn();
      childRef.current = child as unknown as ChildProcess;
      setIsReady(true);
    } catch (err) {
      console.error("[sidecar] Failed to spawn, falling back to mock mode:", err);
      setMockFallback(true);
      setIsReady(true);
    }
  }, [handleMessage]);

  const sendCommand = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      if (!childRef.current && !isMocked) {
        await spawnSidecar();
      }
      if (!isReady && !isMocked) {
        await spawnSidecar();
      }

      const message = JSON.stringify({ type, payload }) + "\n";

      if (isMocked) {
        console.log("[sidecar mock] Sending:", message.trim());
        simulateMockResponse(type, payload, handleMessage);
        return;
      }

      if (childRef.current) {
        await childRef.current.write(message);
      }
    },
    [isReady, isMocked, spawnSidecar, handleMessage],
  );

  const killSidecar = useCallback(async () => {
    if (isMocked) {
      console.log("[sidecar mock] Kill requested");
      setIsReady(false);
      return;
    }

    if (childRef.current) {
      await childRef.current.kill();
      childRef.current = null;
      setIsReady(false);
    }
  }, [isMocked]);

  return { sendCommand, killSidecar, isReady: isMocked || isReady };
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
