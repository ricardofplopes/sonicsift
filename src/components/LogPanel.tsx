import { useEffect, useRef } from "react";
import type { LogEntry } from "@/types";

interface LogPanelProps {
  logs: LogEntry[];
}

const levelColors: Record<LogEntry["level"], string> = {
  info: "text-gray-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const levelBadge: Record<LogEntry["level"], string> = {
  info: "bg-gray-700",
  warn: "bg-yellow-900/50",
  error: "bg-red-900/50",
};

export default function LogPanel({ logs }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col max-h-64">
      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-500 font-medium uppercase tracking-wider">
        Logs
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
        {logs.length === 0 && (
          <p className="text-gray-600 p-2">No log entries yet.</p>
        )}
        {logs.map((entry, i) => (
          <div key={i} className="flex gap-2 px-1 py-0.5 rounded hover:bg-gray-800">
            <span className="text-gray-600 shrink-0">
              {formatTime(entry.timestamp)}
            </span>
            <span
              className={`shrink-0 px-1.5 rounded text-[10px] uppercase font-semibold ${levelColors[entry.level]} ${levelBadge[entry.level]}`}
            >
              {entry.level}
            </span>
            <span className={levelColors[entry.level]}>{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}
