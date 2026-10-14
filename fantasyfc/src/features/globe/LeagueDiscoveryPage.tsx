import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LeagueDiscovery } from './LeagueDiscovery'
import { LEAGUES } from './leagues'
import { createLeagueHref } from './globeData'
import { supportsWebGL } from './webgl'
import '../leagues/leagues.css'
import './globeTokens.css'
import './leagueDiscovery.css'

/**
 * League discovery (#30, wired to real leagues in #31). Lazy-loaded from
 * AppRoutes, so three.js and the world map only download when someone opens
 * this page.
 */
export default function LeagueDiscoveryPage() {
  const [webgl] = useState(supportsWebGL)
  return webgl ? <LeagueDiscovery /> : <LeagueListFallback />
}

/** Same choices as the globe, as a plain list, for browsers without WebGL. */
function LeagueListFallback() {
  return (
    <div className="globe-discovery-fallback">
      <p className="globe-kicker">Find a league</p>
      <h1 className="globe-discovery-title">Pick a league</h1>
      <p className="globe-discovery-lede">
        Ten leagues are live. Pick one to join a league or start your own.
      </p>

      <ul className="globe-fallback-list">
        {LEAGUES.map((league) => (
          <li
            key={league.slug}
            className="globe-fallback-row"
            data-soon={league.live ? undefined : true}
          >
            <span className="globe-panel-crest" aria-hidden="true">
              <img src={league.logo} alt="" />
            </span>
            <span className="globe-fallback-name">
              <span className="globe-fallback-league">{league.league}</span>
              <span className="globe-fallback-country">{league.countryName}</span>
            </span>
            {league.live ? (
              <span className="globe-fallback-actions">
                <Link
                  to="/leagues/join"
                  className="leagues-cta leagues-cta--primary leagues-cta--compact"
                >
                  Join
                </Link>
                <Link
                  to={createLeagueHref(league)}
                  className="leagues-cta leagues-cta--secondary leagues-cta--compact"
                >
                  Create
                </Link>
              </span>
            ) : (
              <span className="globe-badge">Coming soon</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
