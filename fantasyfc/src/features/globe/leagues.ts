import premierLeagueLogo from './assets/premier-league.svg'
import laLigaLogo from './assets/la-liga.svg'
import bundesligaLogo from './assets/bundesliga.svg'
import serieALogo from './assets/serie-a.svg'
import ligue1Logo from './assets/ligue-1.svg'
import mlsLogo from './assets/mls.svg'
import j1LeagueLogo from './assets/j1-league.svg'
import eredivisieLogo from './assets/eredivisie.svg'
import primeiraLigaLogo from './assets/primeira-liga.svg'
// Only a raster of the current mark exists; converted to black on transparent so
// it works both on the white crest tile and as the backdrop's CSS mask.
import betwayPremiershipLogo from './assets/betway-premiership.png'

export type League = {
  /** ISO 3166 numeric code of the country, as used by world-atlas. */
  id: number
  slug: string
  /** competition.code in the database (#44), used to look up its leagues. */
  code: string
  league: string
  country: string
  countryName: string
  short: string
  /** Where the marker sits — a readable label anchor, not the geometric centroid. */
  anchor: { lat: number; lon: number }
  /**
   * CSS custom property name (without the `--`) for this league's colour on the
   * globe. Defined in globeTokens.css: the site's violet for live leagues,
   * grey for coming-soon ones.
   */
  token: string
  /** Second colour, same mechanism: the backdrop's rim and drift layers. */
  token2: string
  /** Official league mark, imported so the bundler can hash or inline it. */
  logo: string
  /**
   * Per-league size correction for the corner watermark. The marks range from
   * a 2.5:1 wordmark (J1) to a 1:1.8 portrait badge (Ligue 1), so fitting each
   * into one square box leaves them wildly different visual weights. Values
   * start from equalising covered area and are then pulled back for the wide
   * wordmarks, which read heavier than compact emblems at the same area.
   */
  crestScale: number
  /**
   * Whether leagues can be joined or created here. Every competition on the
   * globe has squads loaded since #44, so all are live; set false to show one
   * as "coming soon" again.
   */
  live: boolean
}

/*
  The globe uses the site's palette rather than each league's brand colours:
  live leagues are violet and coming-soon ones grey (see globeTokens.css). The
  official logos in ./assets/ still appear in the panel and as a watermark.
*/
export const LEAGUES: League[] = [
  {
    id: 826,
    slug: 'premier-league',
    code: 'PL',
    league: 'Premier League',
    country: 'United Kingdom',
    countryName: 'England',
    short: 'ENG',
    anchor: { lat: 52.8, lon: -1.8 },
    token: 'lg-premier-league',
    token2: 'lg2-premier-league',
    logo: premierLeagueLogo,
    crestScale: 1.30, // wide lion + wordmark; equal-area 1.54 sprawls
    live: true,
  },
  {
    id: 724,
    slug: 'la-liga',
    code: 'PD',
    league: 'LaLiga',
    country: 'Spain',
    countryName: 'Spain',
    short: 'ESP',
    anchor: { lat: 40.2, lon: -3.7 },
    token: 'lg-la-liga',
    token2: 'lg2-la-liga',
    logo: laLigaLogo,
    crestScale: 1.15, // slightly wide emblem
    live: true,
  },
  {
    id: 276,
    slug: 'bundesliga',
    code: 'BL1',
    league: 'Bundesliga',
    country: 'Germany',
    countryName: 'Germany',
    short: 'GER',
    anchor: { lat: 51.0, lon: 10.4 },
    token: 'lg-bundesliga',
    token2: 'lg2-bundesliga',
    logo: bundesligaLogo,
    crestScale: 1.00, // square emblem — the reference
    live: true,
  },
  {
    id: 380,
    slug: 'serie-a',
    code: 'SA',
    league: 'Serie A',
    country: 'Italy',
    countryName: 'Italy',
    short: 'ITA',
    anchor: { lat: 42.6, lon: 12.6 },
    token: 'lg-serie-a',
    token2: 'lg2-serie-a',
    logo: serieALogo,
    crestScale: 1.30, // tall emblem
    live: true,
  },
  {
    id: 250,
    slug: 'ligue-1',
    code: 'FL1',
    league: 'Ligue 1',
    country: 'France',
    countryName: 'France',
    short: 'FRA',
    anchor: { lat: 46.6, lon: 2.4 },
    token: 'lg-ligue-1',
    token2: 'lg2-ligue-1',
    logo: ligue1Logo,
    crestScale: 1.32, // tallest emblem, 1:1.8
    live: true,
  },
  {
    id: 840,
    slug: 'mls',
    code: 'MLS',
    league: 'Major League Soccer',
    country: 'United States of America',
    countryName: 'United States',
    short: 'USA',
    anchor: { lat: 39.5, lon: -98.0 },
    token: 'lg-mls',
    token2: 'lg2-mls',
    logo: mlsLogo,
    crestScale: 1.05, // near-square crest
    live: true,
  },
  {
    id: 392,
    slug: 'j1-league',
    code: 'J1',
    league: 'J1 League',
    country: 'Japan',
    countryName: 'Japan',
    short: 'JPN',
    anchor: { lat: 36.4, lon: 138.2 },
    token: 'lg-j1-league',
    token2: 'lg2-j1-league',
    logo: j1LeagueLogo,
    crestScale: 1.28, // widest wordmark; equal-area 1.57 sprawls
    live: true,
  },
  {
    id: 528,
    slug: 'eredivisie',
    code: 'DED',
    league: 'Eredivisie',
    country: 'Netherlands',
    countryName: 'Netherlands',
    short: 'NED',
    anchor: { lat: 52.2, lon: 5.5 },
    token: 'lg-eredivisie',
    token2: 'lg2-eredivisie',
    logo: eredivisieLogo,
    crestScale: 1.25, // wide wordmark, 1.7:1
    live: true,
  },
  {
    id: 620,
    slug: 'primeira-liga',
    code: 'PPL',
    league: 'Primeira Liga',
    country: 'Portugal',
    countryName: 'Portugal',
    short: 'POR',
    anchor: { lat: 39.6, lon: -8.0 },
    token: 'lg-primeira-liga',
    token2: 'lg2-primeira-liga',
    logo: primeiraLigaLogo,
    crestScale: 1.3, // tall emblem, 1:1.33
    live: true,
  },
  {
    id: 710,
    slug: 'betway-premiership',
    code: 'PSL',
    league: 'Betway Premiership',
    country: 'South Africa',
    countryName: 'South Africa',
    short: 'RSA',
    anchor: { lat: -29.0, lon: 25.0 },
    token: 'lg-betway-premiership',
    token2: 'lg2-betway-premiership',
    logo: betwayPremiershipLogo,
    crestScale: 1.05, // near-square lion + wordmark
    live: true,
  },
]

export const LEAGUE_BY_ID = new Map(LEAGUES.map((l) => [l.id, l]))
