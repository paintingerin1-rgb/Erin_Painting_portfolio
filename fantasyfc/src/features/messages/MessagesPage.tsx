import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { handleRealtimeInsert, mergeFetchHistory, type LeagueMessage } from "./messagesLogic";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import "./MessagesPage.css";

export default function MessagesPage() {
  // The chat follows the league picked in the sidebar switcher.
  const { currentLeagueId: selectedLeagueId, leagues, isLoading: loadingLeagues } = useCurrentLeague();
  
  const currentLeague = leagues.find(l => l.id === selectedLeagueId);
  const isCommissioner = currentLeague?.role === "COMMISSIONER";

  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // Send/delete failures, shown above the composer instead of a blocking browser dialog.
  const [chatError, setChatError] = useState<string | null>(null);
  
  // A ref to keep track of the bottom of the chat feed so we can auto scroll to it
  const bottomOfFeedRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    let active = true;

    // Fetch my user id for delete permissions
    supabase.auth.getUser().then(({ data }) => {
      if (active) setMyUserId(data.user?.id || null);
    });
    return () => {
      active = false;
    };
  }, []);

  /*
    Any time the user clicks a different league in the sidebar, we need to
    clear the old chat history and go grab the messages for the newly selected league.
  */
  useEffect(() => {
    if (!selectedLeagueId) return;

    let active = true;
    
    const fetchHistory = async () => {
      // Clear out the previous league's messages immediately so they don't leak over
      setMessages([]);
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("league_message")
        .select(`
          *,
          profile:user_id(username, avatar_url)
        `)
        .eq("league_id", selectedLeagueId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching message history:", error);
      } else if (active && data) {
        setMessages((prev) => mergeFetchHistory(prev, data as unknown as LeagueMessage[]));
      }
      if (active) setLoadingMessages(false);
    };

    fetchHistory();

    return () => {
      active = false;
    };
  }, [selectedLeagueId]);

  /*
    Here is where the magic happens for real time chat. We set up a subscription channel
    with Supabase to listen for new inserts and updates specifically for the active league.
    This means if someone else types a message, it will pop up on our screen instantly.
  */
  useEffect(() => {
    if (!selectedLeagueId) return;

    const channel = supabase
      .channel(`league_${selectedLeagueId}_messages`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "league_message",
          filter: `league_id=eq.${selectedLeagueId}`,
        },
        async (payload) => {
          const newMsg = payload.new as LeagueMessage;
          
          // Because real time payloads don't include joined tables, we have to
          // manually fetch the sender's profile info right after receiving the message.
          let profileData = null;
          for (let i = 0; i < 3; i++) {
            const { data, error } = await supabase
              .from("profile")
              .select("username, avatar_url")
              .eq("id", newMsg.user_id)
              .single();
            if (!error && data) {
              profileData = data;
              break;
            }
            // Wait 1s before retry
            await new Promise((res) => setTimeout(res, 1000));
          }

          const fullMsg = { ...newMsg, profile: profileData };
          setMessages((prev) => handleRealtimeInsert(prev, fullMsg as LeagueMessage));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "league_message",
          filter: `league_id=eq.${selectedLeagueId}`,
        },
        (payload) => {
          // Updates are mostly going to be soft deletions, so we just merge the updated row
          // into our local state. This instantly updates the UI to show the tombstone.
          const updatedMsg = payload.new as LeagueMessage;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === updatedMsg.id ? { ...msg, ...updatedMsg } : msg))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedLeagueId]);

  // Make sure we always scroll to the latest message when the message list grows
  useEffect(() => {
    bottomOfFeedRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  /*
    Fires when the user hits the send button or presses enter in the form.
    We push an optimistic message to the screen instantly so it feels blazing fast,
    and then we sync it with the database in the background.
  */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newMessage.trim();
    if (!content || !selectedLeagueId) return;

    setNewMessage(""); // Clear the input box instantly
    setChatError(null);
    setShowEmojiPicker(false); // Hide emoji picker on send

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // We grab the user's profile quickly to build the fake optimistic message
    const { data: profile } = await supabase
      .from("profile")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single();

    // Create a temporary ID that is negative so it doesn't clash with real DB IDs
    const tempId = -Date.now();
    const clientId = crypto.randomUUID();
    const optimisticMsg: LeagueMessage = {
      id: tempId,
      league_id: selectedLeagueId,
      user_id: user.id,
      content: content,
      is_deleted: false,
      deleted_by: null,
      created_at: new Date().toISOString(),
      client_id: clientId,
      profile: profile
    };

    // 1. Instantly show it on screen
    setMessages((prev) => [...prev, optimisticMsg]);

    // 2. Send it to the database in the background
    const { data, error } = await supabase.from("league_message").insert({
      league_id: selectedLeagueId,
      user_id: user.id,
      content: content,
      client_id: clientId,
    }).select().single();

    if (error) {
      console.error("Error sending message:", error);
      setChatError("Failed to send message. Make sure you are still a member of this league.");
      // Rollback the optimistic update if it failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } else {
      // 3. Swap out the temporary ID with the real database ID so we can delete it later if needed
      setMessages((prev) => 
        prev.map((m) => (m.id === tempId ? { ...optimisticMsg, id: data.id } : m))
      );
    }
  };

  /*
    Instead of completely obliterating the row from the database, we just flip
    a flag. This lets us show a placeholder tombstone so the chat history doesn't
    look confusing and jumpy. 
  */
  const handleDeleteMessage = async (messageId: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setChatError(null);

    const { error } = await supabase
      .from("league_message")
      .update({ is_deleted: true, deleted_by: user.id })
      .eq("id", messageId);

    if (error) {
      console.error("Error deleting message:", error);
      setChatError("Failed to remove the message. Usually this means you don't have permission.");
    }
  };

  if (loadingLeagues) {
    return <div className="messages-loading">Loading your leagues...</div>;
  }

  return (
    <div className="messages-container">
      <main className="messages-main">
        {selectedLeagueId ? (
          <div className="messages-chat-area">
            {loadingMessages ? (
              <div className="messages-chat-placeholder">Loading messages...</div>
            ) : (
              <div className="messages-feed-wrapper">
                <div className="messages-feed">
                  {messages.length === 0 ? (
                    <div className="messages-chat-placeholder">No messages yet. Be the first to say hi!</div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`message-item ${msg.is_deleted ? "message-item--deleted" : ""}`}>
                        <div className="message-header">
                          <strong>{msg.profile?.username ?? "Unknown"}</strong>
                          <span className="message-time">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          
                          {/* We only render the delete button if the message is still active and we authored it OR we are commissioner */}
                          {!msg.is_deleted && (msg.user_id === myUserId || isCommissioner) && (
                            <button
                              className="message-delete-btn"
                              onClick={() => handleDeleteMessage(msg.id)}
                              title="Delete message"
                            >
                              ×
                            </button>
                          )}
                        </div>
                        
                        {msg.is_deleted ? (
                          <div className="message-content message-content--tombstone">
                            <em>
                              Message deleted{msg.deleted_by === msg.user_id ? ` by ${msg.profile?.username ?? "a member"}` : " by Commissioner"}
                            </em>
                          </div>
                        ) : (
                          <div className="message-content">{msg.content}</div>
                        )}
                      </div>
                    ))
                  )}
                  {/* Invisible element to help us scroll to the bottom */}
                  <div ref={bottomOfFeedRef} />
                </div>
                
                {chatError && (
                  <div className="messages-error" role="alert">
                    {chatError}
                  </div>
                )}

                <form className="messages-composer" onSubmit={handleSendMessage}>
                  <div className="messages-input-wrapper">
                    <input
                      type="text"
                      className="messages-input"
                      placeholder="Type a message..."
                      value={newMessage}
                      maxLength={2000}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button 
                      type="button" 
                      className="messages-emoji-btn" 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      aria-label="Toggle emoji picker"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="messages-emoji-icon">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                    </button>
                    {showEmojiPicker && (
                      <div className="messages-emoji-picker-container">
                        <EmojiPicker 
                          onEmojiClick={(emoji) => setNewMessage(prev => prev + emoji.emoji)} 
                          theme={Theme.DARK}
                        />
                      </div>
                    )}
                  </div>
                  <button type="submit" className="messages-send-btn" disabled={!newMessage.trim()} aria-label="Send">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="messages-send-icon">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="messages-empty-state">
            <h2>No League Selected</h2>
            <p>Please select a league from the sidebar or create a new one to start chatting.</p>
          </div>
        )}
      </main>
    </div>
  );
}
