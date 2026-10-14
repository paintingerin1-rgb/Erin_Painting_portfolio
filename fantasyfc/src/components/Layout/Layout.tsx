import { NavLink, Outlet } from "react-router-dom";
import "./Layout.css";

const NAV = [
  { to: "/players", label: "Players" },
  { to: "/match-center", label: "Match Center" },
  { to: "/standings", label: "Standings" },
  { to: "/scoring", label: "Scoring Engine" },
];

export default function Layout() {
  return (
    <div className="layout">
      <aside className="layout__sidebar">
        <div className="layout__brand">
          <span className="layout__brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7l3.2 2.3-1.2 3.7h-4l-1.2-3.7z" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <span>
            <span className="layout__brand-name">
              Fantasy<span>FC</span>
            </span>
            <span className="layout__brand-sub">Portfolio demo</span>
          </span>
        </div>

        <nav className="layout__nav" aria-label="Main">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `layout__link${isActive ? " layout__link--active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <p className="layout__credit">
          Built by <strong>Erin Painting</strong>
          <br />
          Front-end lead, ENTE-6
        </p>
      </aside>

      <div className="layout__content">
        <div className="layout__banner" role="note">
          Portfolio demo running on sample data. The production app reads live
          data from the official FPL feed via Supabase.
        </div>
        <Outlet />
      </div>
    </div>
  );
}
