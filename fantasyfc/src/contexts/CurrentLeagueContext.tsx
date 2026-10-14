import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { getMyLeagues, type MyLeague } from "../features/leagues/leaguesApi";

export interface Team {
  id: string;
  created_at: string;
  user_id: string;
  league_id: number;
  team_name: string;
  remaining_budget: number;
  is_draft_complete: boolean;
}

interface CurrentLeagueContextType {
  leagues: MyLeague[];
  currentLeagueId: number | null;
  /** The current league's real-world competition, for filtering players,
   *  fixtures and gameweeks. Null when no league is selected. */
  currentCompetitionId: number | null;
  currentTeam: Team | null;
  setLeagueId: (id: number) => void;
  refreshTeam: () => Promise<void>;
  refreshLeagues: () => Promise<void>;
  isLoading: boolean;
}

const CurrentLeagueContext = createContext<CurrentLeagueContextType | undefined>(undefined);

export function CurrentLeagueProvider({ children }: { children: ReactNode }) {
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [currentLeagueId, setCurrentLeagueId] = useState<number | null>(null);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLeagues = async (isInitial = true) => {
    try {
      const leaguesData = await getMyLeagues();
      setLeagues(leaguesData || []);
      
      if (leaguesData && leaguesData.length > 0) {
        if (currentLeagueId === null) {
          const savedId = localStorage.getItem("fantasyfc_current_league_id");
          const hasSavedLeague = savedId && leaguesData.some(l => l.id === Number(savedId));
          
          if (hasSavedLeague) {
            setCurrentLeagueId(Number(savedId));
          } else {
            setCurrentLeagueId(leaguesData[0].id);
          }
        } else if (!leaguesData.some(l => l.id === currentLeagueId)) {
          // If the currently selected league is no longer in the list (e.g. left/kicked/deleted)
          setCurrentLeagueId(leaguesData[0].id);
        }
      } else {
        // No leagues (e.g. just left the last one): nothing can be selected.
        setCurrentLeagueId(null);
        if (isInitial) setIsLoading(false);
      }
    } catch (err) {
      console.error("Failed to load leagues:", err);
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLeagues(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshLeagues = async () => {
    await loadLeagues(false);
  };

  // Fetch team whenever currentLeagueId changes
  useEffect(() => {
    let cancelled = false;
    
    if (!currentLeagueId) {
      if (!isLoading) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCurrentTeam(null);
      }
      return;
    }

    async function loadTeam() {
      setIsLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          throw new Error("Not logged in");
        }

        const { data: teamData, error: teamError } = await supabase
          .from("teams")
          .select("*")
          .eq("league_id", currentLeagueId)
          .eq("user_id", userData.user.id)
          .single();

        if (teamError && teamError.code !== 'PGRST116') {
          // Ignore "no rows returned" error, otherwise throw
          throw teamError;
        }
        
        if (cancelled) return;
        setCurrentTeam(teamData || null);
      } catch (err) {
        console.error("Failed to load team:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTeam();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLeagueId]);

  const setLeagueId = (id: number) => {
    setCurrentLeagueId(id);
    localStorage.setItem("fantasyfc_current_league_id", String(id));
  };

  const refreshTeam = async () => {
    if (!currentLeagueId) return;
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("league_id", currentLeagueId)
        .eq("user_id", userData.user.id)
        .single();

      if (teamError && teamError.code !== 'PGRST116') {
        console.error("Failed to refresh team:", teamError);
        return;
      }
      
      setCurrentTeam(teamData || null);
    } catch (err) {
      console.error("Failed to refresh team:", err);
    }
  };

  return (
    <CurrentLeagueContext.Provider
      value={{
        leagues,
        currentLeagueId,
        currentCompetitionId: leagues.find((l) => l.id === currentLeagueId)?.competitionId ?? null,
        currentTeam,
        setLeagueId,
        refreshTeam,
        refreshLeagues,
        isLoading,
      }}
    >
      {children}
    </CurrentLeagueContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentLeague() {
  const context = useContext(CurrentLeagueContext);
  if (context === undefined) {
    throw new Error("useCurrentLeague must be used within a CurrentLeagueProvider");
  }
  return context;
}
