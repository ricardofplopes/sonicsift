import { useLocation, useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";

interface Step {
  path: string;
  label: string;
  icon: string;
  canNavigate: () => boolean;
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { audioFile, job } = useJobStore();

  const steps: Step[] = [
    {
      path: "/",
      label: "Import",
      icon: "📁",
      canNavigate: () => true,
    },
    {
      path: "/settings",
      label: "Settings",
      icon: "⚙️",
      canNavigate: () => audioFile !== null,
    },
    {
      path: "/progress",
      label: "Process",
      icon: "▶️",
      canNavigate: () =>
        audioFile !== null &&
        (job.status === "analyzing" || job.status === "reviewing"),
    },
    {
      path: "/review",
      label: "Review",
      icon: "🔍",
      canNavigate: () => job.status === "reviewing" || job.status === "exporting" || job.status === "complete",
    },
    {
      path: "/export",
      label: "Export",
      icon: "💾",
      canNavigate: () => job.status === "reviewing" || job.status === "exporting" || job.status === "complete",
    },
  ];

  const currentIndex = steps.findIndex((s) => s.path === location.pathname);

  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col py-6">
      <div className="px-5 mb-8">
        <h1 className="text-xl font-bold tracking-tight text-sonic-400">
          🎵 SonicSift
        </h1>
        <p className="text-xs text-gray-500 mt-1">Audio Processor</p>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {steps.map((step, index) => {
          const isCurrent = step.path === location.pathname;
          const isAccessible = step.canNavigate();
          const isPast = index < currentIndex;

          return (
            <button
              key={step.path}
              onClick={() => isAccessible && navigate(step.path)}
              disabled={!isAccessible}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium
                transition-colors
                ${
                  isCurrent
                    ? "bg-sonic-600/20 text-sonic-400 border border-sonic-600/30"
                    : isPast && isAccessible
                      ? "text-gray-300 hover:bg-gray-800"
                      : isAccessible
                        ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                        : "text-gray-600 cursor-not-allowed"
                }
              `}
            >
              <span className="text-lg">{step.icon}</span>
              <span>{step.label}</span>

              {/* Step index badge */}
              <span
                className={`ml-auto text-xs w-5 h-5 flex items-center justify-center rounded-full
                  ${
                    isCurrent
                      ? "bg-sonic-600 text-white"
                      : isPast
                        ? "bg-gray-700 text-gray-400"
                        : "bg-gray-800 text-gray-600"
                  }
                `}
              >
                {index + 1}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="px-5 mt-auto pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}
