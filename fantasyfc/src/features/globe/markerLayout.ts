import type { League } from './leagues'

/*
  Western Europe packs seven anchors into a few degrees, so labels are fanned out
  to fixed screen offsets and tied back to their point with a leader line —
  stacking them vertically alone was not enough to stop the overlap.
*/
const LABEL_OFFSET: Record<string, [number, number]> = {
  'premier-league': [-168, -104],
  'ligue-1': [-196, 4],
  bundesliga: [104, -150],
  'serie-a': [166, -26],
  'la-liga': [-150, 92],
  eredivisie: [-6, -214],
  'primeira-liga': [-236, 44],
  'betway-premiership': [-170, -40],
  mls: [-40, -104],
  'j1-league': [40, -104],
}

export type LabelLayout = {
  /** Where the label box sits, in px from the marker's point on screen. */
  offset: [number, number]
  /** The leader line from the point to the label, in px and degrees. */
  leader: { length: number; angle: number }
}

export function labelLayout(league: League): LabelLayout {
  const offset = LABEL_OFFSET[league.slug] ?? [0, -100]
  return {
    offset,
    leader: {
      length: Math.hypot(offset[0], offset[1]),
      angle: (Math.atan2(offset[1], offset[0]) * 180) / Math.PI,
    },
  }
}
