import "./SessionRequired.css";

// Shown when VITE_SKIP_AUTH let someone into the app without a real session
// and they reached a page that talks to Supabase. Every RLS policy in this
// schema is scoped `to authenticated`, so as the anon role those queries come
// back with zero rows and fail in ways that look like data bugs rather than
// an auth problem. Better to say so plainly than to let the page break.
export default function SessionRequired() {
  return (
    <div className="session-required">
      <div className="session-required__card">
        <span className="session-required__badge">Sign-in required</span>
        <h2 className="session-required__title">
          This page needs a real session
        </h2>
        <p className="session-required__body">
          You are running with <code>VITE_SKIP_AUTH=true</code>, which skips the
          login screen. Leagues reads and writes live data, and every row-level
          security policy here only grants access to signed-in users, so these
          queries return nothing without a session.
        </p>
        <p className="session-required__body">
          Set <code>VITE_SKIP_AUTH=false</code> in your <code>.env.local</code>,
          restart the dev server, and sign in.
        </p>
      </div>
    </div>
  );
}
