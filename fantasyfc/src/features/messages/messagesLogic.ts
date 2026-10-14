export interface LeagueMessage {
  id: number;
  league_id: number;
  user_id: string;
  content: string;
  is_deleted: boolean;
  deleted_by: string | null;
  created_at: string;
  client_id?: string;
  profile?: {
    username: string;
    avatar_url: string | null;
  } | null;
}

export function handleRealtimeInsert(prev: LeagueMessage[], fullMsg: LeagueMessage): LeagueMessage[] {
  const isOptimisticMatch = prev.some(
    (m) => m.id < 0 && (
      (m.client_id && fullMsg.client_id && m.client_id === fullMsg.client_id) ||
      (!m.client_id && m.user_id === fullMsg.user_id && m.content === fullMsg.content)
    )
  );

  if (isOptimisticMatch) {
    // Replace the temp message with the real one, preserving order
    return prev.map((m) =>
      m.id < 0 && (
        (m.client_id && fullMsg.client_id && m.client_id === fullMsg.client_id) ||
        (!m.client_id && m.user_id === fullMsg.user_id && m.content === fullMsg.content)
      )
        ? { ...m, id: fullMsg.id, client_id: fullMsg.client_id }
        : m
    );
  }

  if (prev.some((m) => m.id === fullMsg.id)) {
    return prev;
  }
  
  return [...prev, fullMsg];
}

export function mergeFetchHistory(prev: LeagueMessage[], dataMsgs: LeagueMessage[]): LeagueMessage[] {
  const fetchedIds = new Set(dataMsgs.map((m) => m.id));
  
  const newRealtimeMsgs = prev.filter((m) => !fetchedIds.has(m.id) && m.id > 0);
  const optimisticMsgs = prev.filter((m) => m.id < 0);
  
  return [...dataMsgs, ...newRealtimeMsgs, ...optimisticMsgs];
}
