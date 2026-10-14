import { NavLink } from "react-router-dom";
import LeagueSwitcher from "../LeagueSwitcher/LeagueSwitcher";
import "./Sidebar.css";

interface SidebarProps {
  userName: string;
  userMeta: string;
  onSignOut: () => void;
}

// Leagues is the one section with a live data layer behind it, so it leads.
// Everything below it renders a Sprint 2 placeholder for now.
const NAV_ITEMS = [
  { to: "/leagues", label: "Leagues", icon: <IconLeagues /> },
  { to: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
  { to: "/squad", label: "My Squad", icon: <IconSquad /> },
  { to: "/players", label: "Players", icon: <IconPlayers /> },
  { to: "/draft", label: "Draft", icon: <IconDraft /> },
  { to: "/standings", label: "Standings", icon: <IconStandings /> },
  { to: "/match-center", label: "Match Center", icon: <IconMatchCenter /> },
  { to: "/messages", label: "Messages", icon: <IconMessages /> },
];

export default function Sidebar({
  userName,
  userMeta,
  onSignOut,
}: SidebarProps) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15 15 0 010 20 15 15 0 010-20z" />
          </svg>
        </span>
        <span className="sidebar__brand-text">
          <div className="sidebar__brand-name">
            FANTASY<span>FC</span>
          </div>
          <div className="sidebar__brand-sub">
            Powered by <span className="entelect-wordmark">Entelect</span>
          </div>
        </span>
      </div>

      <LeagueSwitcher />

      <div className="sidebar__label">Main menu</div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar__link${isActive ? " sidebar__link--active" : ""}`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <span className="sidebar__avatar">{initials}</span>
        <span className="sidebar__user-text">
          <div className="sidebar__user-name">{userName}</div>
          <div className="sidebar__user-meta">{userMeta}</div>
        </span>
      </div>
      <button className="sidebar__signout" onClick={onSignOut}>
        <IconSignOut />
        Sign Out
      </button>
    </aside>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconSquad() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function IconPlayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 15c2.5.3 4 1.9 4 5" />
    </svg>
  );
}
function IconLeagues() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z" />
      <path d="M17 5h2a2 2 0 010 4h-1M7 5H5a2 2 0 000 4h1" />
    </svg>
  );
}
function IconDraft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v8M8 6l4 4 4-4" />
      <rect x="3" y="14" width="18" height="7" rx="1.5" />
    </svg>
  );
}
function IconStandings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 20V10M12 20V4M20 20v-6" />
    </svg>
  );
}
function IconMessages() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 11.5a8.38 8.38 0 01-9 8.5 8.5 8.5 0 01-4-1L3 20l1.3-3.9A8.5 8.5 0 1121 11.5z" />
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

function IconMatchCenter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h6M15 9h6M3 15h6M15 15h6" />
    </svg>
  );
}
