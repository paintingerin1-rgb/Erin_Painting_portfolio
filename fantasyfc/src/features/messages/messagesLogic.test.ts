import { describe, it, expect } from "vitest";
import { handleRealtimeInsert, mergeFetchHistory, type LeagueMessage } from "./messagesLogic";

describe("Message Logic - handleRealtimeInsert", () => {
  const mockMsg = (id: number, content: string, user_id = "user1", client_id?: string): LeagueMessage => ({
    id,
    league_id: 1,
    user_id,
    content,
    is_deleted: false,
    deleted_by: null,
    created_at: new Date().toISOString(),
    client_id,
  });

  it("should append a normal new realtime message", () => {
    const prev = [mockMsg(1, "hello")];
    const newMsg = mockMsg(2, "world");
    const result = handleRealtimeInsert(prev, newMsg);
    
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual(newMsg);
  });

  it("should ignore exact duplicates (same DB ID)", () => {
    const prev = [mockMsg(1, "hello"), mockMsg(2, "world")];
    const duplicateMsg = mockMsg(2, "world"); // ID 2 already exists
    const result = handleRealtimeInsert(prev, duplicateMsg);
    
    expect(result).toHaveLength(2);
    expect(result).toEqual(prev); // should return unchanged array
  });

  it("should replace an optimistic message with the real DB message", () => {
    const tempMsg = mockMsg(-12345, "optimistic text");
    const prev = [mockMsg(1, "hello"), tempMsg];
    
    // Realtime echo arrives from DB with real ID but same content/user
    const realMsg = mockMsg(2, "optimistic text");
    
    const result = handleRealtimeInsert(prev, realMsg);
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2); // Swapped tempId for realId
    expect(result[1].content).toBe("optimistic text");
  });

  it("should distinguish identical consecutive messages using client_id", () => {
    // Sent "lol" twice very quickly
    const uuid1 = "123-abc";
    const uuid2 = "456-def";
    
    const msg1 = mockMsg(-1, "lol", "user1", uuid1);
    const msg2 = mockMsg(-2, "lol", "user1", uuid2);
    const prev = [msg1, msg2];
    
    // Realtime echo for the first message arrives
    const realMsg1 = mockMsg(100, "lol", "user1", uuid1);
    
    const result = handleRealtimeInsert(prev, realMsg1);
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(100); // Swapped!
    expect(result[1].id).toBe(-2);  // Untouched because client_id didn't match!
  });

  it("should NOT match optimistic messages if the user_id is different", () => {
    const myTempMsg = mockMsg(-12345, "wow", "user1");
    const prev = [myTempMsg];
    
    // Someone else said "wow" at the same time
    const otherUserMsg = mockMsg(5, "wow", "user2");
    
    const result = handleRealtimeInsert(prev, otherUserMsg);
    
    // Both should exist, no swapping
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(-12345);
    expect(result[1].id).toBe(5);
  });
});

describe("Message Logic - mergeFetchHistory", () => {
  const mockMsg = (id: number, content: string): LeagueMessage => ({
    id,
    league_id: 1,
    user_id: "user1",
    content,
    is_deleted: false,
    deleted_by: null,
    created_at: new Date().toISOString(),
  });

  it("should return exactly the fetched data if state is empty", () => {
    const prev: LeagueMessage[] = [];
    const data = [mockMsg(1, "a"), mockMsg(2, "b")];
    
    const result = mergeFetchHistory(prev, data);
    expect(result).toEqual(data);
  });

  it("should preserve realtime messages that arrived during the fetch", () => {
    // While fetching [1, 2], message 3 arrived via realtime and was put in prev
    const prev = [mockMsg(3, "c")];
    const data = [mockMsg(1, "a"), mockMsg(2, "b")];
    
    const result = mergeFetchHistory(prev, data);
    
    expect(result).toHaveLength(3);
    // Data first, then the newer realtime message
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
    expect(result[2].id).toBe(3);
  });

  it("should preserve optimistic messages during fetch", () => {
    const prev = [mockMsg(-123, "sending...")];
    const data = [mockMsg(1, "old message")];
    
    const result = mergeFetchHistory(prev, data);
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(-123);
  });

  it("should deduplicate if realtime event matches a fetched message", () => {
    // Edge case: realtime event fired and added msg 2 to prev, 
    // but the fetch was so slow it ALSO included msg 2.
    const prev = [mockMsg(2, "b")];
    const data = [mockMsg(1, "a"), mockMsg(2, "b")];
    
    const result = mergeFetchHistory(prev, data);
    
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });
});
