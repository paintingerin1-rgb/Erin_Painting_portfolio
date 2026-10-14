// Competitions - portfolio version of the one function the Players page
// uses from production's leaguesApi.

import { COMPETITIONS, later } from "../../data/sampleData";

export interface Competition {
  id: number;
  name: string;
  /** football-data.org's code where it has one: PL, PD, BL1, ... PSL. */
  code: string;
  country: string | null;
}

export async function listCompetitions(): Promise<Competition[]> {
  return later(COMPETITIONS.map((c) => ({ ...c })), 120);
}
