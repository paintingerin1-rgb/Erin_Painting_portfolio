import "./StatCard.css";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  hero?: boolean;
  subPositive?: boolean;
}

export default function StatCard({
  label,
  value,
  sub,
  hero,
  subPositive,
}: StatCardProps) {
  return (
    <div className={`stat-card${hero ? " stat-card--hero" : ""}`}>
      {hero && (
        <div className="stat-card__arena">
          <div className="stat-card__arena-glow" />
          <div className="stat-card__arena-ring" />
        </div>
      )}
      <div className="stat-card__content">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        {sub && (
          <p
            className={`stat-card__sub${subPositive ? " stat-card__sub--positive" : ""}`}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
