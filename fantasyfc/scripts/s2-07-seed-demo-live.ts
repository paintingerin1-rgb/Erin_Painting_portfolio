// S2-07 DEMO CONVENIENCE — NOT part of the real ingestion path and not
// something a scoring/points calculation should ever read meaning into.
//
// The real FPL calendar has an international break baked in right now:
// Gameweek 5 finished 18 Sept, Gameweek 6 doesn't kick off until 10 Oct.
// That means between now and the Sprint 2 demo there is no genuinely live
// fixture anywhere in the feed - `npm run ingest:fixtures` alone can only
// ever produce COMPLETED and UPCOMING rows before then, never LIVE.
//
// This script takes ONE already-completed fixture and flips its `status`
// back to 'LIVE' so the Match Center has something to point at during the
// demo. It is clearly synthetic. Do not run it against anything but a
// demo/staging database. Re-running `npm run ingest:fixtures` afterwards
// restores the real status, since the feed still reports that match as
// finished.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment.
//
// Run: npm run seed:demo-live

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const { data: fixture, error: fetchError } = await supabase
    .from("fixture")
    .select(
      "id, home:club!home_club_id(short_code), away:club!away_club_id(short_code), competition!inner(code)",
    )
    .eq("status", "COMPLETED")
    .eq("competition.code", "PL")
    .order("kickoff_at", { ascending: false })
    .limit(1)
    .single()
    // Without generated DB types supabase-js can't tell these many-to-one
    // embeds return a single object rather than an array.
    .overrideTypes<{
      id: number;
      home: { short_code: string } | null;
      away: { short_code: string } | null;
    }>();

  if (fetchError || !fixture) {
    throw new Error(
      `Could not find a completed fixture to repurpose as LIVE (${fetchError?.message ?? "none found"}). Run npm run ingest:fixtures first.`,
    );
  }

  const { error: updateError } = await supabase
    .from("fixture")
    .update({ status: "LIVE" })
    .eq("id", fixture.id);
  if (updateError) throw new Error(`Update failed: ${updateError.message}`);

  console.log(
    `Marked fixture ${fixture.id} (${fixture.home?.short_code} v ${fixture.away?.short_code}) as LIVE for the demo. ` +
      `Run npm run ingest:fixtures afterwards to restore its real COMPLETED status.`,
  );
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exitCode = 1;
});
