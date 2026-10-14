import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import "./leagues.css";

interface LeagueMember {
  user_id: string;
  role: string;
  profile: {
    username: string;
    avatar_url: string | null;
  };
}

export default function LeagueDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Errors from delete/kick, shown inline above the member list so a failed
  // action doesn't replace the whole page the way a load error does.
  const [actionError, setActionError] = useState<string | null>(null);
  
  const { refreshLeagues } = useCurrentLeague();

  useEffect(() => {
    let cancelled = false;

    async function fetchLeagueDetails() {
      try {
        if (!id) throw new Error("No league ID provided");

        const sessionResponse = await supabase.auth.getSession();
        if (sessionResponse.data.session) {
          setCurrentUserId(sessionResponse.data.session.user.id);
        }

        // Fetch the members and their profiles
        // We use inner joins here to ensure we get profile data
        const { data: membersData, error: membersError } = await supabase
          .from("league_member")
          .select(`
            user_id,
            role,
            profile:user_id(username, avatar_url)
          `)
          .eq("league_id", id);

        if (membersError) throw membersError;

        // supabase-js typing for joined tables can be tricky, cast and transform
        if (!cancelled) {
          type MemberRow = { user_id: string; role: string; profile: { username: string; avatar_url: string | null; } | { username: string; avatar_url: string | null; }[] };
          const transformedMembers = (membersData as unknown as MemberRow[]).map((m) => ({
            user_id: m.user_id,
            role: m.role,
            profile: Array.isArray(m.profile) ? m.profile[0] : m.profile
          })) as LeagueMember[];
          
          setMembers(transformedMembers);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load league details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLeagueDetails();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <div className="leagues-loading">Loading league details...</div>;
  if (error) return <div className="leagues-error">{error}</div>;

  const isCommissioner = members.find(m => m.user_id === currentUserId)?.role === 'COMMISSIONER';

  async function handleDeleteLeague() {
    if (!window.confirm("Are you sure you want to delete this league? This cannot be undone.")) return;
    setActionError(null);

    try {
      const { error } = await supabase.rpc('delete_league', { p_league_id: id });
      if (error) throw error;
      await refreshLeagues();
      navigate('/leagues');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleKickUser(userId: string) {
    if (!window.confirm("Are you sure you want to kick this user from the league?")) return;
    setActionError(null);

    try {
      const { error } = await supabase.rpc('kick_league_member', { p_league_id: id, p_target_user_id: userId });
      if (error) throw error;
      await refreshLeagues();
      setMembers((prev) => prev.filter(m => m.user_id !== userId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="leagues-page">
      <main className="leagues-main">
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Link to="/leagues" className="leagues-cta leagues-cta--secondary leagues-cta--compact" style={{ display: 'inline-block', marginBottom: '24px' }}>
              &larr; Back to Hub
            </Link>
            <p className="leagues-list-heading" style={{ margin: 0, fontSize: '1rem', color: '#fff', opacity: 0.8 }}>League Members</p>
          </div>
          {isCommissioner && (
            <button 
              onClick={handleDeleteLeague}
              className="leagues-cta leagues-cta--danger leagues-cta--compact"
            >
              Delete League
            </button>
          )}
        </div>

        {actionError && (
          <div className="leagues-error" role="alert" style={{ maxWidth: '800px', margin: '0 0 16px' }}>
            {actionError}
          </div>
        )}

        <div className="league-card" style={{ maxWidth: '800px', margin: '0' }}>
          <ul className="leagues-list">
            {members.map((member) => (
              <li key={member.user_id} className="league-row-container" style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', marginBottom: '8px' }}>
                {member.profile.avatar_url ? (
                  <img src={member.profile.avatar_url} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '16px', border: '1px solid rgba(255,255,255,0.1)' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '16px', backgroundColor: 'rgba(139, 109, 199, 0.18)', border: '1px solid rgba(139, 109, 199, 0.4)', color: '#c7b6e8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {member.profile.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                  <span className="league-row__name">{member.profile.username}</span>
                </div>
                {member.role === 'COMMISSIONER' && (
                  <span className="league-row__badge league-row__badge--private">
                    Commissioner
                  </span>
                )}
                {isCommissioner && member.role !== 'COMMISSIONER' && (
                  <button 
                    onClick={() => handleKickUser(member.user_id)}
                    className="leagues-cta leagues-cta--danger-outline leagues-cta--compact"
                    style={{ marginLeft: '16px' }}
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
