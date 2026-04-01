import { useLocation, useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import Logo from "@/components/Logo";

const StepIcons = {
  import: (cls: string) => (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17h14" />
      <path d="M10 3v10m0 0l-4-4m4 4l4-4" />
    </svg>
  ),
  settings: (cls: string) => (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M3.4 3.4l1.4 1.4M15.2 15.2l1.4 1.4M3.4 16.6l1.4-1.4M15.2 4.8l1.4-1.4" />
    </svg>
  ),
  process: (cls: string) => (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3v14l12-7z" />
    </svg>
  ),
  review: (cls: string) => (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="16" height="3" rx="1" />
      <rect x="2" y="9" width="10" height="3" rx="1" />
      <rect x="2" y="14" width="13" height="3" rx="1" />
    </svg>
  ),
  export: (cls: string) => (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 13v3a1 1 0 001 1h12a1 1 0 001-1v-3" />
      <path d="M10 13V3m0 0l4 4m-4-4L6 7" />
    </svg>
  ),
};

type StepIconKey = keyof typeof StepIcons;

interface Step {
  path: string;
  label: string;
  iconKey: StepIconKey;
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
      iconKey: "import",
      canNavigate: () => true,
    },
    {
      path: "/settings",
      label: "Settings",
      iconKey: "settings",
      canNavigate: () => audioFile !== null,
    },
    {
      path: "/progress",
      label: "Process",
      iconKey: "process",
      canNavigate: () =>
        audioFile !== null &&
        (job.status === "analyzing" || job.status === "reviewing"),
    },
    {
      path: "/review",
      label: "Review",
      iconKey: "review",
      canNavigate: () => job.status === "reviewing" || job.status === "exporting" || job.status === "complete",
    },
    {
      path: "/export",
      label: "Export",
      iconKey: "export",
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

      <nav className="flex-1 flex flex-col gap-1 px-3">
        {steps.map((step, index) => {
          const isCurrent = step.path === location.pathname;
          const isAccessible = step.canNavigate();
          const isPast = index < currentIndex;

          return (
            <div key={step.path} className="relative flex items-center">
              {/* Connecting line */}
              {index > 0 && (
                <div
                  className={`absolute left-[15px] -top-1 h-1 w-0.5 transition-colors duration-300 ${
                    isPast || isCurrent ? "bg-sonic-600" : "bg-gray-700/50"
                  }`}
                />
              )}
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-[15px] -bottom-1 h-1 w-0.5 transition-colors duration-300 ${
                    isPast ? "bg-sonic-600" : "bg-gray-700/50"
                  }`}
                />
              )}

              {/* Step button — circle + icon + label in one row */}
              <button
                onClick={() => isAccessible && navigate(step.path)}
                disabled={!isAccessible}
                className={`
                  relative z-10 w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left text-sm font-medium
                  transition-all duration-200
                  ${
                    isCurrent
                      ? "bg-sonic-600/15 text-sonic-300"
                      : isPast && isAccessible
                        ? "text-gray-300 hover:bg-gray-800/70"
                        : isAccessible
                          ? "text-gray-400 hover:bg-gray-800/70 hover:text-gray-200"
                          : "text-gray-600 cursor-not-allowed opacity-40"
                  }
                `}
              >
                {/* Number circle */}
                <div
                  className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0
                    transition-all duration-300
                    ${
                      isCurrent
                        ? "bg-sonic-600 text-white shadow-[0_0_10px_rgba(61,107,255,0.4)]"
                        : isPast
                          ? "bg-sonic-700/80 text-sonic-200"
                          : isAccessible
                            ? "bg-gray-700/80 text-gray-400"
                            : "bg-gray-800/40 text-gray-700"
                    }
                  `}
                >
                  {isPast ? (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8.5l3.5 3.5L13 5" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Icon */}
                {StepIcons[step.iconKey](
                  `w-4 h-4 shrink-0 ${
                    isCurrent
                      ? "text-sonic-400"
                      : isPast
                        ? "text-gray-400"
                        : "text-gray-500"
                  }`
                )}

                {/* Label */}
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
