import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useJobStore } from "@/stores/jobStore";
import { useSidecar } from "@/hooks/useSidecar";
import ProgressBar from "@/components/ProgressBar";
import LogPanel from "@/components/LogPanel";

export default function ProgressPage() {
  const navigate = useNavigate();
  const { job } = useJobStore();
  const { killSidecar } = useSidecar();

  // Auto-navigate to review when analysis completes
  useEffect(() => {
    if (job.status === "reviewing") {
      const timer = setTimeout(() => navigate("/review"), 500);
      return () => clearTimeout(timer);
    }
  }, [job.status, navigate]);

  const handleCancel = async () => {
    await killSidecar();
    navigate("/settings");
  };

  return (
    <div className="flex flex-col h-full p-8 gap-6">
      <h2 className="text-2xl font-bold text-gray-100">Processing</h2>

      {/* Phase label */}
      <div className="text-center">
        <p className="text-lg text-gray-300 mb-4">{job.phase || "Waiting..."}</p>
        <ProgressBar percent={job.progress} label="Analysis Progress" />
      </div>

      {/* Status */}
      {job.status === "error" && (
        <div className="card border-red-700 bg-red-900/20">
          <p className="text-red-400 font-medium">Error</p>
          <p className="text-red-300 text-sm mt-1">{job.error}</p>
        </div>
      )}

      {/* Logs */}
      <div className="flex-1 min-h-0">
        <LogPanel logs={job.logs} />
      </div>

      {/* Cancel */}
      <div className="flex gap-3">
        <button onClick={handleCancel} className="btn-danger">
          Cancel
        </button>
        {job.status === "reviewing" && (
          <button onClick={() => navigate("/review")} className="btn-primary">
            Continue to Review →
          </button>
        )}
      </div>
    </div>
  );
}
