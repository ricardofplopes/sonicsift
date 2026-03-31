import { useCallback, useRef, useState } from "react";
import { useJobStore } from "@/stores/jobStore";
import type { Segment, SidecarMessage } from "@/types";

// TODO: Wire to actual sidecar once Rust backend is built
// When the sidecar is available, uncomment the Tauri imports and remove mock mode.
// import { Command } from "@tauri-apps/plugin-shell";

const MOCK_MODE = true;

/**
 * Custom hook to communicate with the Python sidecar via JSON-over-stdio.
 *
 * In mock mode, it simulates sidecar responses for development without a
 * compiled Rust backend / Python worker.
 */
export function useSidecar() {
  const [isReady, setIsReady] = useState(false);
  const childRef = useRef<unknown>(null);
  const store = useJobStore;

  const handleMessage = useCallback((msg: SidecarMessage) => {
    const state = store.getState();
    switch (msg.type) {
      case "progress":
        state.updateProgress(
          msg.payload.progress as number,
          msg.payload.phase as string | undefined,
        );
        break;
      case "log":
        state.addLog(
          msg.payload.level as "info" | "warn" | "error",
          msg.payload.message as string,
        );
        break;
      case "segments":
        state.setSegments(msg.payload.segments as Segment[]);
        break;
      case "complete":
        state.setComplete(msg.payload.outputPath as string);
        break;
      case "error":
        state.setError(msg.payload.message as string);
        break;
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

    // TODO: Wire to actual sidecar once Rust backend is built
    // const command = Command.sidecar("binaries/sonicsift-worker");
    // command.stdout.on("data", (line: string) => {
    //   try {
    //     const msg: SidecarMessage = JSON.parse(line);
    //     handleMessage(msg);
    //   } catch {
    //     console.warn("[sidecar] Non-JSON stdout:", line);
    //   }
    // });
    // command.stderr.on("data", (line: string) => {
    //   console.error("[sidecar stderr]", line);
    //   store.getState().addLog("warn", `[stderr] ${line}`);
    // });
    // command.on("close", (data: { code: number }) => {
    //   console.log("[sidecar] Exited with code:", data.code);
    //   childRef.current = null;
    //   setIsReady(false);
    // });
    // childRef.current = await command.spawn();
    // setIsReady(true);
  }, [handleMessage]);

  const sendCommand = useCallback(
    async (type: string, payload: Record<string, unknown> = {}) => {
      if (!childRef.current && !MOCK_MODE) {
        await spawnSidecar();
      }
      if (!isReady && !MOCK_MODE) {
        await spawnSidecar();
      }

      const message = JSON.stringify({ type, payload }) + "\n";

      if (MOCK_MODE) {
        console.log("[sidecar mock] Sending:", message.trim());
        simulateMockResponse(type, payload, handleMessage);
        return;
      }

      // TODO: Wire to actual sidecar once Rust backend is built
      // await (childRef.current as { write(data: string): Promise<void> }).write(message);
    },
    [isReady, spawnSidecar, handleMessage],
  );

  const killSidecar = useCallback(async () => {
    if (MOCK_MODE) {
      console.log("[sidecar mock] Kill requested");
      setIsReady(false);
      return;
    }

    // TODO: Wire to actual sidecar once Rust backend is built
    // if (childRef.current) {
    //   await (childRef.current as { kill(): Promise<void> }).kill();
    //   childRef.current = null;
    //   setIsReady(false);
    // }
  }, []);

  return { sendCommand, killSidecar, isReady: MOCK_MODE || isReady };
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
