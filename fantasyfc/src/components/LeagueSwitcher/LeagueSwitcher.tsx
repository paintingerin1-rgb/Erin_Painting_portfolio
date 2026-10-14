import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import type { MyLeague } from "../../features/leagues/leaguesApi";
import "./LeagueSwitcher.css";

// Badge label, short display name and colour per competition code. The colours
// only need to tell the leagues apart at a glance; anything unknown falls back
// to the app's purple.
const COMPETITIONS: Record<string, { label: string; name: string; bg: string; fg?: string }> = {
  PL: { label: "PL", name: "Premier League", bg: "#37003c" },
  PD: { label: "LL", name: "LaLiga", bg: "#ee8707" },
  BL1: { label: "BL", name: "Bundesliga", bg: "#d20515" },
  SA: { label: "SA", name: "Serie A", bg: "#0068a8" },
  FL1: { label: "L1", name: "Ligue 1", bg: "#12233f", fg: "#dcf215" },
  DED: { label: "ED", name: "Eredivisie", bg: "#ff6200" },
  PPL: { label: "LP", name: "Primeira Liga", bg: "#0b6e4f" },
  PSL: { label: "PSL", name: "Betway Prem", bg: "#f2b705", fg: "#111" },
  MLS: { label: "MLS", name: "MLS", bg: "#1d2a44" },
  J1: { label: "J1", name: "J1 League", bg: "#b10f2e" },
};

function competitionOf(league: MyLeague) {
  const known = league.competitionCode ? COMPETITIONS[league.competitionCode] : undefined;
  return (
    known ?? {
      label: (league.competitionCode ?? "?").slice(0, 3),
      name: league.competitionName ?? "",
      bg: "#4a3370",
    }
  );
}

function Badge({ league, small = false }: { league: MyLeague; small?: boolean }) {
  const c = competitionOf(league);
  return (
    <span
      className={
        "lswitch__badge" +
        (small ? " lswitch__badge--small" : "") +
        (c.label.length > 2 ? " lswitch__badge--long" : "")
      }
      style={{ background: c.bg, color: c.fg ?? "#fff" }}
      aria-hidden="true"
    >
      {c.label}
    </span>
  );
}

function VisibilityIcon({ league }: { league: MyLeague }) {
  const isPrivate = league.visibility === "PRIVATE";
  return (
    <svg
      className="lswitch__vis-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden="true"
    >
      {isPrivate ? (
        <>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
        </>
      )}
    </svg>
  );
}

const visibilityLabel = (league: MyLeague) =>
  league.visibility === "PRIVATE" ? "Private" : "Public";

/**
 * The sidebar's league picker: a card for the league the app is showing,
 * which opens a list of the user's leagues. The list opens inside the
 * sidebar and scrolls, so it pushes the menu down instead of covering it.
 * Keyboard: arrows move, Enter or Space picks, Escape closes.
 */
export default function LeagueSwitcher() {
  const { leagues, currentLeagueId, setLeagueId, isLoading } = useCurrentLeague();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = leagues.find((l) => l.id === currentLeagueId) ?? leagues[0];
  const currentIndex = Math.max(0, leagues.findIndex((l) => l.id === current?.id));

  // Close when a click lands anywhere outside the switcher.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted league in view as the arrow keys scroll the list.
  useEffect(() => {
    if (!open) return;
    const option = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    option?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIndex]);

  // Same as before: nothing to switch between until the user is in a league.
  if (leagues.length === 0 && !isLoading) return null;

  if (!current) {
    return (
      <div className="lswitch">
        <div className="lswitch__label">Switch league</div>
        <div className="lswitch__card lswitch__card--loading">Loading leagues…</div>
      </div>
    );
  }

  const openList = () => {
    setActiveIndex(currentIndex);
    setOpen(true);
  };

  const choose = (league: MyLeague) => {
    setLeagueId(league.id);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % leagues.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + leagues.length) % leagues.length);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(leagues.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(leagues[activeIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const competition = competitionOf(current);

  return (
    <div className="lswitch" ref={rootRef}>
      <div className="lswitch__label" id={`${listId}-label`}>
        Switch league
      </div>
      <button
        type="button"
        className={`lswitch__card${open ? " lswitch__card--open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label ${listId}-current`}
        aria-activedescendant={open ? `${listId}-opt-${activeIndex}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <Badge league={current} />
        <span className="lswitch__text">
          <span className="lswitch__name" id={`${listId}-current`}>
            {current.name}
          </span>
          <span className="lswitch__sub" title={`${visibilityLabel(current)} league`}>
            <VisibilityIcon league={current} />
            <span className="lswitch__sub-text">{competition.name}</span>
          </span>
        </span>
        <svg className="lswitch__chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul className="lswitch__list" role="listbox" id={listId} aria-label="Your leagues" ref={listRef}>
          {leagues.map((league, i) => {
            const selected = league.id === current.id;
            // The badge already says which competition; the line under the
            // name says what the badge can't.
            const details = [
              visibilityLabel(league),
              league.role === "COMMISSIONER" ? "Commissioner" : null,
            ].filter(Boolean);
            return (
              <li
                key={league.id}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={selected}
                title={`${league.name} · ${competitionOf(league).name}`}
                className={
                  "lswitch__option" +
                  (selected ? " lswitch__option--selected" : "") +
                  (i === activeIndex ? " lswitch__option--active" : "")
                }
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(league)}
              >
                <Badge league={league} small />
                <span className="lswitch__text">
                  <span className="lswitch__name">{league.name}</span>
                  <span className="lswitch__sub">
                    <VisibilityIcon league={league} />
                    <span className="lswitch__sub-text">{details.join(" · ")}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
