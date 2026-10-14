import { Link } from 'react-router-dom'
import type { League } from './leagues'
import type { PanelLeague } from './globeData'
import { createLeagueHref } from './globeData'
import type { CompetitionLeagues } from './useCompetitionLeagues'
import { JoinByCodeForm } from '../leagues/JoinByCodeForm'

type Props = {
  league: League | null
  /** The selected league's public leagues, already marked joined or not. */
  leagues: CompetitionLeagues
  rows: PanelLeague[]
  joiningId: number | null
  joinError: string | null
  onJoin: (row: PanelLeague) => void
  onOpen: (row: PanelLeague) => void
  onDismiss: () => void
  /** Moves the selection to a live league from a "coming soon" one. */
  onShowLive: () => void
  /** The panel shows the join-code form instead of the league's public leagues. */
  codeOpen: boolean
  onOpenCode: () => void
  onCloseCode: () => void
  onCodeJoined: (leagueId: number) => void
}

export function RegionPanel({
  league,
  leagues,
  rows,
  joiningId,
  joinError,
  onJoin,
  onOpen,
  onDismiss,
  onShowLive,
  codeOpen,
  onOpenCode,
  onCloseCode,
  onCodeJoined,
}: Props) {
  if (league && codeOpen) {
    return (
      <aside className="globe-panel" data-open aria-label="Join with a code">
        <div className="globe-panel-inner" key={`${league.slug}-code`}>
          <button type="button" className="globe-panel-close" onClick={onCloseCode}>
            Back to {league.league}
          </button>

          <header className="globe-panel-head">
            <div>
              <p className="globe-kicker">Private league</p>
              <h2 className="globe-panel-title">Join with a code</h2>
            </div>
          </header>

          <p className="globe-panel-lede">
            Enter the 6 character code the league's commissioner shared with you.
          </p>

          <JoinByCodeForm
            onJoined={onCodeJoined}
            autoFocus
            inputClassName="globe-code-input"
            buttonClassName="globe-league-btn globe-league-btn--join globe-code-submit"
            errorClassName="globe-list-error"
          />
        </div>
      </aside>
    )
  }


  return (
    <aside className="globe-panel" data-open={league ? true : undefined} aria-hidden={!league}>
      {league && (
        <div className="globe-panel-inner" key={league.slug}>
          <button type="button" className="globe-panel-close" onClick={onDismiss}>
            Back to globe
          </button>

          <header className="globe-panel-head">
            {/*
              The marks are drawn for light grounds, so the tile stays light
              rather than the logo washing out on the dark surface.
            */}
            <span className="globe-panel-crest" aria-hidden="true">
              <img src={league.logo} alt="" />
            </span>
            <div>
              <p className="globe-kicker">{league.countryName}</p>
              <h2 className="globe-panel-title">{league.league}</h2>
            </div>
          </header>

          {league.live ? (
            <>
              <span className="globe-badge globe-badge--live">Live</span>
              <p className="globe-panel-lede">
                Join a public league and take a spot, or start your own and invite people.
              </p>

              <p className="globe-list-heading">Public leagues</p>
              <LeagueList
                leagues={leagues}
                rows={rows}
                joiningId={joiningId}
                onJoin={onJoin}
                onOpen={onOpen}
              />
              {joinError && <p className="globe-list-error" role="alert">{joinError}</p>}

              <div className="globe-panel-actions">
                <Link to={createLeagueHref(league)} className="globe-action globe-action-primary">
                  <span className="globe-action-title">Create a new league</span>
                  <span className="globe-action-sub">Make it public or private, then invite your friends</span>
                </Link>
                <button type="button" className="globe-action" onClick={onOpenCode}>
                  <span className="globe-action-title">Have a join code?</span>
                  <span className="globe-action-sub">Enter it to join a private league</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="globe-badge">Coming soon</span>
              <p className="globe-panel-lede">
                {league.league} isn't open yet. Pick one of the live leagues instead.
              </p>

              <div className="globe-panel-actions">
                <button type="button" className="globe-action" onClick={onShowLive}>
                  <span className="globe-action-title">Go to a live league</span>
                  <span className="globe-action-sub">Join or create a league there</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function LeagueList({
  leagues,
  rows,
  joiningId,
  onJoin,
  onOpen,
}: Pick<Props, 'leagues' | 'rows' | 'joiningId' | 'onJoin' | 'onOpen'>) {
  if (leagues.status === 'loading' || leagues.status === 'idle') {
    return <p className="globe-list-note">Loading leagues…</p>
  }
  if (leagues.status === 'error') {
    return <p className="globe-list-error">{leagues.message}</p>
  }
  if (rows.length === 0) {
    return <p className="globe-list-note">No public leagues yet. Create the first one.</p>
  }
  return (
    <ul className="globe-league-list">
      {rows.map((row) => (
        <li key={row.id} className="globe-league-row">
          <span className="globe-league-name">{row.name}</span>
          {row.joined ? (
            <button type="button" className="globe-league-btn" onClick={() => onOpen(row)}>
              Open
            </button>
          ) : (
            <button
              type="button"
              className="globe-league-btn globe-league-btn--join"
              disabled={joiningId !== null}
              onClick={() => onJoin(row)}
            >
              {joiningId === row.id ? 'Joining…' : 'Join'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
