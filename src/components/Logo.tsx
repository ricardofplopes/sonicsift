import logoSvg from "@/assets/logo.svg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

const sizes = { sm: 24, md: 32, lg: 48 } as const;

export default function Logo({ size = "md", showText = true }: LogoProps) {
  const px = sizes[size];
  const textClass =
    size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-base";

  return (
    <div className="flex items-center gap-2">
      <img src={logoSvg} alt="SonicSift" width={px} height={px} />
      {showText && (
        <span
          className={`${textClass} tracking-tight bg-gradient-to-r from-sonic-400 to-sonic-600 bg-clip-text text-transparent`}
        >
          <span className="font-bold">Sonic</span>
          <span className="font-medium">Sift</span>
        </span>
      )}
    </div>
  );
}
