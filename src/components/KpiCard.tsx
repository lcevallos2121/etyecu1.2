type KpiCardProps = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  iconColor: "purple" | "teal" | "coral";
  sparkPoints: string;
};

const iconBg = {
  purple: "bg-accent/[0.18] text-[#c4b8ff]",
  teal: "bg-green/[0.16] text-[#6ee7b7]",
  coral: "bg-red/[0.16] text-[#fca5a5]",
};

const sparkColor = {
  purple: "#a78bfa",
  teal: "#6ee7b7",
  coral: "#f87171",
};

export function KpiCard({ label, value, delta, trend, iconColor, sparkPoints }: KpiCardProps) {
  return (
    <div className="card p-4">
      <div className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[13px] mb-3.5 ${iconBg[iconColor]}`}>
        ◆
      </div>
      <p className="text-[12px] text-text-dim">{label}</p>
      <p className="text-[22px] font-semibold my-0.5 mb-2">{value}</p>
      <span
        className={`text-[11.5px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
          trend === "up" ? "text-[#6ee7b7] bg-green/10" : "text-[#fca5a5] bg-red/10"
        }`}
      >
        {trend === "up" ? "▲" : "▼"} {delta}
      </span>
      <svg viewBox="0 0 200 40" className="h-8.5 mt-2.5 w-full" preserveAspectRatio="none">
        <polyline
          points={sparkPoints}
          fill="none"
          stroke={sparkColor[iconColor]}
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
