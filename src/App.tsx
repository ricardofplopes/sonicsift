import { useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import ImportPage from "@/pages/ImportPage";
import SettingsPage from "@/pages/SettingsPage";
import ProgressPage from "@/pages/ProgressPage";
import ReviewPage from "@/pages/ReviewPage";
import ExportPage from "@/pages/ExportPage";
import Logo from "@/components/Logo";

const STEPS = [
  { path: "/", label: "Import" },
  { path: "/settings", label: "Settings" },
  { path: "/progress", label: "Processing" },
  { path: "/review", label: "Review" },
  { path: "/export", label: "Export" },
];

const NEXT_STEP: Record<string, string> = {
  "/": "/settings",
  "/settings": "/progress",
  "/progress": "/review",
  "/review": "/export",
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentStep = STEPS.find((s) => s.path === location.pathname);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        navigate("/");
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        const next = NEXT_STEP[location.pathname];
        if (next) navigate(next);
      } else if (e.key === "Escape") {
        const idx = STEPS.findIndex((s) => s.path === location.pathname);
        if (idx > 0) {
          e.preventDefault();
          navigate(STEPS[idx - 1].path);
        }
      }
    },
    [navigate, location.pathname],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* Title bar */}
      <header
        className="h-10 shrink-0 flex items-center px-4 gap-3 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 z-50"
        data-tauri-drag-region
      >
        <Logo size="sm" />
        <div className="w-px h-4 bg-gray-700" />
        <span className="text-xs text-gray-400">
          {currentStep?.label ?? "SonicSift"}
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-gray-600">
          <kbd className="px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700">Ctrl+O</kbd>
          <span>Import</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700">Ctrl+↵</kbd>
          <span>Next</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700">Esc</kbd>
          <span>Back</span>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/export" element={<ExportPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
