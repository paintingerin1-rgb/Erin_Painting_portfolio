import { vi } from 'vitest';

export const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null })
  })),
  rpc: vi.fn(),
};

vi.mock('../lib/supabaseClient', () => ({
  supabase: mockSupabase,
}));