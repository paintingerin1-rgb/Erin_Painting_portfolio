// Supabase client - portfolio stand-in.
//
// Production creates a real Supabase client (Postgres + Google OAuth). The
// only call the ported pages make is auth.getSession(), which Standings uses
// to highlight the signed-in manager's row, so this returns a demo session.

import { DEMO_USER_ID } from "../data/sampleData";

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: DEMO_USER_ID } } }, error: null };
    },
  },
};
