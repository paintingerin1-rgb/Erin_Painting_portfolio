import { Outlet } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";
import "./AppLayout.css";

// Purely decorative stadium furniture - position/timing only, no domain data.
const NEON_BARS = [
  { left: "4%", top: "12%", width: "8%", rotate: -16, delay: "0s" },
  { left: "18%", top: "22%", width: "9%", rotate: -14, delay: "0.8s" },
  { left: "34%", top: "9%", width: "7%", rotate: -10, delay: "1.6s" },
  { left: "58%", top: "10%", width: "8%", rotate: 10, delay: "0.5s" },
  { left: "73%", top: "20%", width: "9%", rotate: 14, delay: "2s" },
  { left: "88%", top: "12%", width: "7%", rotate: 16, delay: "1.2s" },
];

const CAMERA_FLASHES = [
  { top: "14%", left: "20%", delay: "0s" },
  { top: "10%", left: "70%", delay: "1.4s" },
  { top: "18%", left: "45%", delay: "2.6s" },
];

interface AppLayoutProps {
  userName: string;
  userMeta: string;
  onSignOut: () => void;
}

export default function AppLayout({
  userName,
  userMeta,
  onSignOut,
}: AppLayoutProps) {
  return (
    <>
      <div className="dashboard-backdrop-photo" aria-hidden="true" />
      <div className="dashboard-backdrop-tint" aria-hidden="true" />

      <div className="dashboard-rig" aria-hidden="true">
        {NEON_BARS.map((bar, i) => (
          <span
            key={i}
            className="dashboard-neon"
            style={{
              left: bar.left,
              top: bar.top,
              width: bar.width,
              transform: `rotate(${bar.rotate}deg)`,
              animationDelay: bar.delay,
            }}
          />
        ))}
      </div>

      <div aria-hidden="true">
        {CAMERA_FLASHES.map((dot, i) => (
          <span
            key={i}
            className="dashboard-flash"
            style={{ top: dot.top, left: dot.left, animationDelay: dot.delay }}
          />
        ))}
      </div>

      <div className="app-shell">
        <Sidebar
          userName={userName}
          userMeta={userMeta}
          onSignOut={onSignOut}
        />
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </>
  );
}
