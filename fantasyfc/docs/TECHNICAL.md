> **Note:** this is the team's original developer README, kept for reference. The project was built on the university's self-hosted GitLab, so the CI and deployment sections describe that setup. In this repository, GitHub Actions runs the same lint, test and build checks (`.github/workflows/fantasyfc-ci.yml`). For an overview of the project and my part in it, see the [main README](../README.md).

# ENTE-6 — Fantasy Football

A fantasy football manager built for Entelect as the RW344 group project, 2026.

Managers sign in with Google, create or join a league, draft a squad within a budget, and score
points from real match statistics. The product is positioned deliberately against Fantasy
Premier League: fewer screens, less clutter, and nothing on the interface that needs
explaining.

**Live:** https://cuneiform-project.vercel.app

---

## Stack

| Layer    | Choice                                                       |
| -------- | ------------------------------------------------------------ |
| Frontend | React 19 + TypeScript, built with Vite                       |
| Routing  | React Router                                                 |
| Backend  | Supabase — Postgres, Auth, Row-Level Security                |
| Auth     | Google OAuth only (no email/password, by client requirement) |
| Hosting  | Vercel, deployed by CI on a `v*` tag (_Deploying_)           |
| CI       | GitLab CI — lint, test and build; staging + production deploy |

There is no separate API server. The browser talks to Postgres through Supabase, and every
table is protected by RLS policies rather than by application-layer checks.

---

## Running it locally

You need **Node 24** and a `.env.local` file. Nothing else.

```bash
git clone https://github.com/paintingerin1-rgb/Erin_Painting_portfolio.git
cd Erin_Painting_portfolio/fantasyfc

cp .env.example .env.local     # then fill in your own Supabase URL and key
npm install
npm run dev
```

Then open http://localhost:5173.

### About `.env.local`

`.env.example` contains the real Supabase URL and publishable key, and that is deliberate. The
publishable (anon) key is designed to be exposed client-side — it grants nothing beyond what
the RLS policies allow. **The `service_role` key must never be committed**, or placed in any
file that is.

### With Docker instead

Same result, but pinned to Node 24 for everyone regardless of what is installed locally:

```bash
cp .env.example .env.local
docker compose up
```

Requires the Compose plugin (`docker compose`, not the older `docker-compose`). On Ubuntu:
`sudo apt install docker-compose-v2`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) then produce a production bundle |
| `npm run lint` | ESLint across the project |
| `npm run preview` | Serve the built bundle locally |
| `npm run test` | Vitest unit and component tests |
| `npm run ingest:players` | Load clubs and players from football-data.org: Premier League by default, `-- PD BL1` or `-- --all` for others (see [Loading football data](#loading-football-data)) |
| `npm run ingest:fixtures` | Load Premier League gameweeks and fixtures from the FPL API — run after `ingest:players` |
| `npm run ingest:espn-leagues` | Load PSL, MLS and J1 League clubs, players, fixtures and gameweeks from ESPN (`-- --all` or codes) |
| `npm run ingest:league-fixtures` | Load gameweeks and fixtures for the six European leagues (`-- --all` or codes) |
| `npm run ingest:league-stats` | Load per-player match stats from API-Football (needs a paid plan for the current season) |
| `npm run ingest:espn-stats` | Load per-player match stats for the nine non-PL leagues from ESPN |
| `npm run price:players` | Reprice every player by status (dry run; `-- --apply` writes) — run after the ingests, see [Player prices](#player-prices-36) |
| `npm run seed:demo-live` | Demo only: fake a live fixture during an international break. Never part of real ingestion |
| `npm run seed:leagues` | Seed demo public and private leagues with members and full squads; `-- --demo-user=<email>` also puts the demo account in one of each (see [Seeding demo leagues](#seeding-demo-leagues)) |
| `npm run seed:leagues:teardown` | Remove the seeded leagues, teams and squads (`-- --full` also deletes the demo accounts) |

`npm run lint`, `npm run build`, and `npm run test` are exactly what CI runs. If they pass locally, the pipeline will pass.

---

## Seeding demo leagues

`scripts/seed-leagues.ts` fills `/leagues/join` with 50–100 mock public leagues and 10 private
ones, 200 demo profiles, and a full legal squad per team.

Create a gitignored `.env.seed` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (from
Project Settings → API — never commit this, never put it in `.env.local`), then:

```bash
npm run seed:leagues                    # seed towards 75 public and 10 private leagues
npm run seed:leagues -- --leagues=100   # or aim higher on public
npm run seed:leagues -- --private=20    # more private leagues (--private=0 skips them)
npm run seed:leagues:teardown           # wipe seeded data, keep demo accounts
```

Private leagues have a 6 character join code. The script prints every seeded private league's
code when it finishes (and on re-runs that have nothing to add), so the demo can join one at
`/leagues/join`. They are small (3–8 members) and seeded before the public ones, because the
5-leagues-per-user cap is shared between the two.

Safe to re-run — tops up instead of duplicating, counting public and private separately. Uses 260
demo profiles rather than the ~30 originally proposed, since `league_member`'s 5-leagues-per-user
cap can't fit 50+ leagues into 30 people.

Leagues are Premier League by default. `--competition=CODE` seeds another competition's leagues
from its own players, and `--dry-run` shows the plan without writing anything. Targets count each
competition separately, so keep them small: the Premier League seed uses most of the 260 profiles'
league slots.

```bash
npm run seed:leagues -- --competition=MLS --leagues=4 --private=1 --dry-run
npm run seed:leagues -- --competition=MLS --leagues=4 --private=1
```

Seeded squads count as drafted an hour before the season's first deadline. Standings only score
gameweeks whose deadline comes after a player was drafted, so squads stamped with the time of the
run would show 0 points until the next gameweek. A re-run also moves squads from an older seed
back to that time.

### Demo day (#42)

The demo account needs to be in a public and a private league, both with drafted squads,
standings with points and chat history. Run these on 14 Oct, after the freeze:

1. Sign in to the live site once with the Google account that will present, so its profile exists.
   Leave leagues until it is in at most 3, since the cap of 5 includes the two below.
2. Bring the points up to date (needs `.env.ingest`, see [Loading football data](#loading-football-data)):

   ```bash
   node --env-file=.env --env-file=.env.ingest scripts/s2-08b-ingest-gameweek-stats.ts
   ```

3. Seed, adding the demo account:

   ```bash
   npm run seed:leagues -- --demo-user=presenter@gmail.com
   ```

   It joins the fullest seeded public and private league that has room, drafts a squad in each,
   and posts a short chat history from the seeded members. It prints both league names and the
   private league's join code. Re-running it reuses the same two leagues.
4. Check in the app: both leagues are under `/leagues`, `/standings` shows points, and
   `/messages` has the chat.

`npm run seed:leagues:teardown` removes all of it, including the demo account's teams and
memberships in seeded leagues. The account itself is kept.

---

## Loading football data

Two scripts fill the hosted database with real data. Both need the Supabase service-role key,
and the player script also needs a free [football-data.org](https://www.football-data.org/client/register)
API key. Put them in a gitignored `.env.ingest` — never commit it, never put it in `.env.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
FOOTBALL_API_KEY=...
```

The scripts don't read env files themselves, so load `.env` (for the Supabase URL) and
`.env.ingest` explicitly, **players first**:

```bash
node --env-file=.env --env-file=.env.ingest scripts/s2-06-ingest-players.js
node --env-file=.env --env-file=.env.ingest scripts/s2-07-ingest-fixtures.ts
```

Both are safe to re-run — they upsert. The fixture script matches FPL teams to clubs by their
three-letter code. When the two providers disagree (Nottingham Forest is `NOT` on
football-data.org but `NFO` in FPL), it skips that club's fixtures and prints the fix: set
`club.fpl_team_id` on the right club by hand. Player ingestion never overwrites that column, so
the fix only needs doing once.

### The other nine leagues

Besides the Premier League there are nine competitions (`competition.code`): LaLiga `PD`,
Bundesliga `BL1`, Serie A `SA`, Ligue 1 `FL1`, Eredivisie `DED`, Primeira Liga `PPL`, the South
African PSL `PSL`, Major League Soccer `MLS` and the J1 League `J1`.

| | Squads | Fixtures + gameweeks | Match stats |
| --- | --- | --- | --- |
| Premier League | football-data.org | FPL API | FPL API |
| Six European leagues | football-data.org | football-data.org | ESPN |
| PSL, MLS, J1 League | ESPN | ESPN | ESPN |

None of the new sources needs a key. Run order, after the Premier League steps above:

```bash
E="--env-file=.env --env-file=.env.ingest"
node $E scripts/s2-06-ingest-players.js --all          # European squads, football-data.org (~1 min)
node $E scripts/s3-44-ingest-fixtures.ts --all         # European gameweeks + fixtures
node $E scripts/s3-45-ingest-espn-leagues.ts --all     # PSL, MLS, J1: clubs, squads, fixtures, gameweeks
node $E scripts/s3-45-ingest-espn-stats.ts --all       # stats for all nine leagues
```

Re-run the last two after each matchday (and `ingest:league-fixtures` when kickoff times change).

#### ESPN

ESPN's public JSON API has no key and no daily limit, but it is **undocumented and unofficial**:
ESPN can change or block it without notice. Present it as "match data via ESPN". Responses are
cached under `.cache/espn/` (finished matches forever, schedules and squads for the day), so a
first full stats run is about 450 requests and later runs only fetch new matches. Use league
codes and `--gameweek=N` to fetch less, e.g. `... s3-45-ingest-espn-stats.ts BL1 --gameweek=6`.

- **European leagues:** clubs are matched to ESPN teams by kickoff time, and players by name within
  their club. Players missing from football-data.org's squads (late transfers, youth players) are
  listed as unmatched and score nothing.
- **PSL, MLS and J1 League:** everything comes from ESPN, so ids line up and nothing needs
  matching. ESPN has no round numbers, so a gameweek is a **calendar week** (Monday to Sunday, local
  time: South Africa, US Pacific, Japan) with at least one match. A club with a midweek and a
  weekend match plays twice in that gameweek. Gameweek N is the Nth week since the season's first
  match, so weeks without matches (international breaks) are skipped numbers; that way a postponed
  match moving into an empty week never renumbers later gameweeks. Only the current league stage
  is loaded (not J1's spring 2026 special league, nor playoffs).
  Clubs and players no longer in the league are removed on each run unless someone has drafted
  them.
- **Safety:** if a reload would drop more than a quarter of a league's stored fixtures, ESPN's data
  has probably changed shape (for example a relabelled season), so the loader leaves that league's
  fixtures, gameweeks and points alone and prints a warning. Gameweeks that hold points are never
  deleted either. Check ESPN, then re-run with `--force` if the change is real.

Scoring: ESPN counts goals conceded while each player is on the pitch (FPL's rule), so clean
sheets are exact, and it includes own goals. Minutes come from substitution and red-card times.
Always 0, because the feed doesn't have them: penalties saved/missed, bonus points and defensive
contribution.

#### API-Football (optional, paid)

`ingest:league-stats` is an alternative stats source for the six European leagues using
[API-Football](https://dashboard.api-football.com) (`API_FOOTBALL_KEY` in `.env.ingest`). **Free
keys only reach seasons 2022–2024**, so on the free plan it skips every league; it needs a paid
plan for the current season. It caches under `.cache/api-football/`, stops at
`--max-requests=90`, and links clubs by kickoff time into `club.api_football_team_id`. Its scoring
approximates goals conceded and clean sheets over the whole match and uses tackles + blocks +
interceptions for defensive contribution.

### Player prices (#36)

Run this **last**, after any players or stats ingest: the player ingests reset prices to a simple
position-and-club formula, and the stats ingests feed the ranking.

```bash
node --env-file=.env --env-file=.env.ingest scripts/s3-36-price-players.ts           # dry run: summary
node --env-file=.env --env-file=.env.ingest scripts/s3-36-price-players.ts --apply   # write prices
```

- **Premier League:** FPL's own price (`now_cost`) for every player the name matcher finds.
- **Everyone else** (the other nine leagues, and PL players FPL doesn't list) is ranked within
  their league and position by a status score, 60% season points (FPL rules, from our match
  stats) and 40% club form (points per game), and given the price at the same rank in FPL's real
  price spread for that position. A league's best striker costs what a top PL striker does and a
  £100m squad is as tight everywhere. Early in a season the points side is noisy, so re-run it
  weekly; prices settle as matches are played.
- Squads already drafted are unaffected: each pick keeps its `draft_price`, and releasing a
  player refunds that.
- `--show=Kane,Mbappé` prints those players' old and new prices.

The rules are in `scripts/lib/pricing.ts`, with tests.

---

## Database

Twenty-one migrations live in `supabase/migrations/`, applied in filename order. They create
eleven tables — `competition`, `profile`, `league`, `league_member`, `league_message`, `club`,
`football_players`, `teams`, `drafted_players`, `gameweek`, `fixture` — along with the Postgres
functions behind leagues, the budget draft and league chat, and RLS policies on every table.

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # apply migrations to the hosted project
```

Two things worth knowing before you touch the schema:

- **Migrations are append-only.** Write a new one; never edit a file that has already been
  applied, or environments silently drift apart.
- **Name a new migration after the latest one on `master`.** `db push` refuses to slot an
  older-numbered file in behind migrations the hosted project already has. If a branch sat
  open while others merged, rename its unapplied migration before merging.
- **Creating and joining a league run as database functions**, not as direct inserts from the
  browser. A route that forgets to check permissions still cannot read a private league,
  because the database refuses it.

The full schema design — 33 tables across six areas, of which eleven are currently deployed —
lives in the project documentation rather than in this repository.

---

## What is actually built

Live and backed by the database:

- `/` — Google sign-in
- `/leagues` — your leagues, plus public leagues to browse
- `/leagues/create` — create a league, public or private, and receive a join code
- `/leagues/join` — join by code
- `/leagues/:id` — league members
- `/players` — the player database
- `/draft` — budget draft
- `/squad` — your drafted squad
- `/match-center` — fixtures and results by gameweek
- `/messages` — league chat
- `/standings` — your position in every league; `/standings/:leagueId` for a league's full table

Designed, but **not yet routed** pending its data layer: Dashboard. That path renders an
honest "coming soon" placeholder rather than mock data, so nothing on screen can be mistaken
for working functionality.

---

## Deploying

**Tagging `master` deploys the site.** Production moves only at milestones:

| Event                      | CI job              | Result                                  |
| -------------------------- | ------------------- | --------------------------------------- |
| Merge request              | `verify`            | Lint, test, build. Nothing deployed.    |
| Merge into `master`        | `deploy-staging`    | A Vercel preview deployment (staging).  |
| Push a `v*` tag            | `deploy-production` | `vercel deploy --prod` — the live site. |

Every deploy waits for `verify` on the same commit; if it fails, nothing ships. The staging URL
is the last line of the `deploy-staging` job log.

To release, tag the `master` commit you have tested on staging:

```bash
git fetch origin
git tag -a v2.1-milestone origin/master -m "What this milestone delivers"
git push origin v2.1-milestone
```

Only Maintainers can push `v*` tags (**Settings → Repository → Protected tags**). The tag has to
be protected: `VERCEL_TOKEN` is a protected variable, so an unprotected tag's pipeline cannot
see it and the deploy fails at the preflight step. To roll back, promote the previous
production deployment in the Vercel dashboard (**Deployments → ⋯ → Promote**).

CI does the deploying because Vercel's Git integration supports GitHub, GitLab.com and
Bitbucket — not a self-hosted GitLab, which is what `git.cs.sun.ac.za` is.

**The database is not deployed.** A merge that adds a file to `supabase/migrations/` also
needs `npx supabase db push` (see _Database_), or the new frontend calls tables and functions
the hosted project doesn't have yet.

Things that have broken the deploy before:

- **`VERCEL_TOKEN`** (Settings → CI/CD → Variables) must be scoped to the whole Vercel team,
  not just the project. A project-only token fails with the misleading "Could not retrieve
  Project Settings". The job's first step prints the token's fingerprint and the API status
  to tell these cases apart.
- **Vercel builds the site, not CI.** The Supabase variables are marked Sensitive in Vercel,
  so a build inside CI only sees `[SENSITIVE]` placeholders and ships a blank page. Build
  settings are pinned in `vercel.json`.

If CI is down, deploy by hand from a machine logged in to the Vercel project:

```bash
npx vercel --prod
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: `master` is protected, every change
arrives through a merge request with one approval, and nobody merges their own work.
