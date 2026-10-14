import "./PlayerCard.css";

export type Position = "GK" | "DEF" | "MID" | "FWD";

interface PlayerCardProps {
  name: string;
  position: Position;
  rating: number;
  isCaptain?: boolean;
  isVice?: boolean;
  dimmed?: boolean; // used for bench cards
  onSwap?: (e: React.MouseEvent) => void;
}

function JerseyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 2L4 5v3l2 1v13h12V9l2-1V5l-4-3-2 2h-4L8 2z" />
    </svg>
  );
}

function GloveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l7 3v6c0 5-3 9-7 11-4-2-7-6-7-11V5l7-3z" />
    </svg>
  );
}

export default function PlayerCard({
  name,
  position,
  rating,
  isCaptain,
  isVice,
  dimmed,
  onSwap,
}: PlayerCardProps) {
  return (
    <button
      type="button"
      className={`pcard pcard--${position}${dimmed ? " pcard--dimmed" : ""}`}
      onClick={onSwap}
    >
      {isCaptain && <span className="pcard-badge badge-c">C</span>}
      {isVice && <span className="pcard-badge badge-v">V</span>}
      <div className="pcard-face">
        <span className="pcard-rating">
          <span className="pcard-rating__num">${rating}M</span>
          <span className="pcard-rating__pos">{position}</span>
        </span>
        <span className="pcard-jersey">
          {position === "GK" ? <GloveIcon /> : <JerseyIcon />}
        </span>
        <span className="pcard-name-band">
          <span className="pcard-name">{name}</span>
        </span>
      </div>
    </button>
  );
}
