import { useState } from "react";
import bgImage from "../../assets/stadium-bg.png";
import { signInWithGoogle } from "../../lib/auth";
import "./LoginPage.css";

// Intrinsic size of stadium-bg.png. The rig SVG uses this as its viewBox
// with preserveAspectRatio="slice" so it crops exactly like the image's
// object-fit: cover, keeping the lights locked to the roof at any viewport.
const BG_W = 1701;
const BG_H = 925;

// The roof rim: traced programmatically from the photo itself by flood-filling
// the night sky, then walking the boundary where it meets the stadium ceiling
// with a Moore-neighbour contour trace. Boundary-following (rather than a
// column-by-column scan) is what keeps the near-vertical left/right corners
// on the curve instead of cutting straight across them.
const ROOF_RIM_PATH =
  "M 846.5,13.8 L 868.1,14.1 L 890,14.9 L 912,16.3 L 934,18 L 956,20.3 L 978,23.6 L 1000,28.1 L 1022,33.1 L 1044,38.5 L 1066,45 L 1088,53 L 1110,62.5 L 1132,72.9 L 1154,84.5 L 1176,97.5 L 1198,112 L 1220,127.3 L 1242,143.2 L 1264,160.1 L 1286,177.6 L 1308,196.4 L 1329.4,216.6 L 1349.3,238 L 1366.7,260 L 1377.6,282 L 1374.5,302.3 L 1357.9,317.6 L 1336,327.1 L 1314,334 L 1292,339.8 L 1270.6,344.6 L 1249.8,348.5 L 1229,352 L 1207,355.7 L 1185,359.5 L 1163,363.3 L 1141,367.2 L 1119,371.2 L 1097,375.2 L 1075,379.2 L 1053,383.3 L 1031,387.6 L 1009,391.5 L 987,394.9 L 965,397.4 L 943,398.7 L 921,398.6 L 899,397.1 L 877,394.2 L 855,390.7 L 833,386.9 L 811,382.8 L 789,378.6 L 767,374.2 L 745,369.9 L 723,365.8 L 701,361.8 L 679,357.7 L 657,353.8 L 635,350 L 613,346.2 L 591,342.5 L 569,338.7 L 547,335.1 L 525,331.6 L 503,328.1 L 481,324.7 L 459,321.1 L 437,317.2 L 415.8,313.5 L 396.7,309 L 377.6,303.2 L 356.1,293.8 L 340.8,279.5 L 340.8,259.9 L 355.5,238 L 375.1,216.4 L 396.3,195.9 L 418,176.8 L 440,159 L 462,142.1 L 484,126.1 L 506,110.8 L 528,96.6 L 550,83.6 L 572,72.2 L 594,62 L 616,53 L 638,45.2 L 660,38.7 L 682,33.4 L 704,28.5 L 726,24.3 L 748,21 L 770,18.4 L 792,16.5 L 814,15 L 835.7,14 Z";

// Camera flashes repositioned into the crowd/flare bands at the sides
// (the visible smoke and flags in the photo), not floating in the sky.
const CAMERA_FLASHES = [
  { top: "63%", left: "9%", delay: "0s", size: 5 },
  { top: "58%", left: "20%", delay: "0.8s", size: 4 },
  { top: "72%", left: "5%", delay: "0.4s", size: 5 },
  { top: "78%", left: "12%", delay: "2.0s", size: 6 },
  { top: "68%", left: "80%", delay: "1.6s", size: 6 },
  { top: "60%", left: "88%", delay: "2.4s", size: 4 },
  { top: "65%", left: "95%", delay: "1.2s", size: 4 },
  { top: "75%", left: "85%", delay: "3.0s", size: 4 },
];

const SPOTLIGHT_BEAMS = [
  { rotate: -32, delay: "0s", color: "rgba(196, 140, 255, 0.55)" },
  { rotate: -14, delay: "0.7s", color: "rgba(240, 171, 252, 0.45)" },
  { rotate: 9, delay: "1.4s", color: "rgba(196, 140, 255, 0.5)" },
  { rotate: 28, delay: "2.1s", color: "rgba(232, 121, 249, 0.5)" },
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
	  console.error("Google sign-in error:", err);
      setError("Couldn't sign in with Google. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <img src={bgImage} alt="" className="login-page__bg" />
      <div className="login-page__overlay-dark" />
      <div className="login-page__overlay-violet" />
      <div className="login-page__sweep" aria-hidden="true" />

      <div className="login-page__beams" aria-hidden="true">
        {SPOTLIGHT_BEAMS.map((beam, i) => (
          <span
            key={i}
            className="login-page__beam"
            style={
              {
                "--beam-rotate": `${beam.rotate}deg`,
                "--beam-color": beam.color,
                animationDelay: beam.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <svg
        className="login-page__rig"
        viewBox={`0 0 ${BG_W} ${BG_H}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="rigGradient"
            gradientUnits="userSpaceOnUse"
            x1="330"
            y1="0"
            x2="1385"
            y2="0"
          >
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="28%" stopColor="#f472b6" />
            <stop offset="52%" stopColor="#e879f9" />
            <stop offset="76%" stopColor="#f472b6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <filter
            id="rigGlow"
            x="-15%"
            y="-15%"
            width="130%"
            height="130%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="9" />
          </filter>
        </defs>

        {/* soft continuous halo so the rig reads as one connected strip */}
        <path className="rig-halo" d={ROOF_RIM_PATH} />
        {/* individual bulbs chasing around the brim */}
        <path className="rig-bulbs" d={ROOF_RIM_PATH} />
      </svg>

      <div aria-hidden="true">
        {CAMERA_FLASHES.map((dot, i) => (
          <span
            key={i}
            className="login-page__flash"
            style={{
              top: dot.top,
              left: dot.left,
              width: dot.size,
              height: dot.size,
              animationDelay: dot.delay,
            }}
          />
        ))}
      </div>

      <header className="login-page__header">
        <div className="login-page__brand">
          <span className="login-page__brand-mark">
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
          <span className="login-page__brand-name">
            FANTASY<span>FC</span>
          </span>
        </div>
        <span className="login-page__powered">
          Powered by <span className="entelect-wordmark">Entelect</span>
        </span>
      </header>

      <main className="login-page__main">
        <h1 className="login-page__headline">
          Build your dream <span>squad</span>
        </h1>
        <p className="login-page__tagline">
          Draft real players, manage your lineup, and compete in private
          leagues.
        </p>

        <div className="login-card">
          <h2 className="login-card__title">Welcome back</h2>
          <p className="login-card__subtitle">
            Sign in with Google to manage your squad and check standings.
          </p>

          <button
            type="button"
            className="login-card__google-btn"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <GoogleIcon />
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <p
            className={`login-card__error ${error ? "login-card__error--visible" : ""}`}
          >
            {error || "\u00A0"}
          </p>

          <p className="login-card__legal">
            <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>
          </p>
        </div>
      </main>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 014.9 12c0-.79.14-1.56.37-2.28v-3.1H1.27A11.98 11.98 0 000 12c0 1.94.47 3.77 1.27 5.38l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.1C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
