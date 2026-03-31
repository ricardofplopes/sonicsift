import { useLocation, useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import Logo from "@/components/Logo";

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
      <div className="px-5 mb-8 pb-4 border-b border-gray-800">
        <Logo size="md" />
        <p className="text-xs text-gray-500 mt-1">Audio Processor</p>
      </div>

      <nav className="flex-1 flex flex-col px-3">
        {steps.map((step, index) => {
          const isCurrent = step.path === location.pathname;
          const isAccessible = step.canNavigate();
          const isPast = index < currentIndex;

          return (
            <div key={step.path} className="flex items-stretch">
              {/* Step indicator column with connecting line */}
              <div className="flex flex-col items-center w-7 shrink-0">
                {index > 0 && (
                  <div
                    className={`w-0.5 flex-1 transition-colors duration-300 ${
                      isPast || isCurrent ? "bg-sonic-600" : "bg-gray-700"
                    }`}
                  />
                )}
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                    transition-all duration-300
                    ${
                      isCurrent
                        ? "bg-sonic-600 text-white shadow-[0_0_12px_rgba(26,70,255,0.5)] animate-pulse-sonic"
                        : isPast
                          ? "bg-sonic-700 text-sonic-200"
                          : isAccessible
                            ? "bg-gray-700 text-gray-400"
                            : "bg-gray-800/60 text-gray-700"
                    }
                  `}
                >
                  {isPast ? "✓" : index + 1}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 transition-colors duration-300 ${
                      isPast ? "bg-sonic-600" : "bg-gray-700"
                    }`}
                  />
                )}
              </div>

              {/* Step button */}
              <button
                onClick={() => isAccessible && navigate(step.path)}
                disabled={!isAccessible}
                className={`
                  flex-1 flex items-center gap-2 ml-3 px-2 py-2.5 rounded-lg text-left text-sm font-medium
                  transition-all duration-200
                  ${
                    isCurrent
                      ? "bg-sonic-600/20 text-sonic-400"
                      : isPast && isAccessible
                        ? "text-gray-300 hover:bg-gray-800"
                        : isAccessible
                          ? "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                          : "text-gray-600 cursor-not-allowed opacity-40"
                  }
                `}
              >
                <span className="text-lg">{step.icon}</span>
                <span>{step.label}</span>
              </button>
            </div>
          );
        })}
      </nav>

      <div className="px-5 mt-auto pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}
