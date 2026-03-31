interface ProgressBarProps {
  percent: number;
  label?: string;
  color?: string;
}

export default function ProgressBar({
  percent,
  label,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const isActive = clamped > 0 && clamped < 100;

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm text-gray-300">{label}</span>
          <span className="text-sm font-mono text-gray-400">
            {Math.round(clamped)}%
          </span>
        </div>
      )}
      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-sonic-600 to-sonic-400 ${isActive ? "progress-shimmer" : ""}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
