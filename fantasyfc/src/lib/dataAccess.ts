import type {
  PostgrestError,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/supabase-js";

// Every RLS policy in this schema is scoped `to authenticated`. When a request
// arrives without a session, Postgres does not raise a permission error on
// reads - the rows simply are not there. PostgREST then reports that as a
// shape problem ("Cannot coerce the result to a single JSON object" from
// .single()), which reads as a data bug and sends you looking in the wrong
// place. These helpers translate the codes back into what actually happened.

/** PostgREST: .single() asked for exactly one row and got none, or several. */
const NO_SINGLE_ROW = "PGRST116";
/** Postgres: a write was refused by RLS or a missing grant. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres: unique constraint violated. */
const UNIQUE_VIOLATION = "23505";

/**
 * Turn a PostgrestError into something a user can act on. `subject` names what
 * was being fetched or changed, e.g. "the competition" or "your leagues".
 */
export function describeError(error: PostgrestError, subject: string): string {
  switch (error.code) {
    case NO_SINGLE_ROW:
      return `Could not load ${subject}. You may not be signed in, or you do not have access to it.`;
    case INSUFFICIENT_PRIVILEGE:
      return `You do not have permission to change ${subject}. You may not be signed in.`;
    case UNIQUE_VIOLATION:
      return `${subject} already exists.`;
    default:
      return error.message;
  }
}

/**
 * Unwrap a query expected to return a single row. Throws with a readable
 * message when the query errored or came back empty.
 */
export function unwrapOne<T>(
  result: PostgrestSingleResponse<T>,
  subject: string,
): T {
  if (result.error) throw new Error(describeError(result.error, subject));
  if (result.data === null || result.data === undefined) {
    throw new Error(
      `Could not load ${subject}. You may not be signed in, or you do not have access to it.`,
    );
  }
  return result.data;
}

/** Unwrap a query expected to return a list. Missing data reads as empty. */
export function unwrapMany<T>(
  result: PostgrestResponse<T>,
  subject: string,
): T[] {
  if (result.error) throw new Error(describeError(result.error, subject));
  return result.data ?? [];
}

/**
 * Unwrap a write that returns nothing useful. Throws with a readable message
 * when RLS or a constraint refused it.
 */
export function assertOk(
  result: { error: PostgrestError | null },
  subject: string,
): void {
  if (result.error) throw new Error(describeError(result.error, subject));
}

/**
 * Take the first row of a set-returning RPC. Guards the empty case, which
 * would otherwise surface as a TypeError on undefined further downstream.
 */
export function firstRow<T>(rows: T[] | null, subject: string): T {
  const row = rows?.[0];
  if (row === undefined) {
    throw new Error(`Could not load ${subject}. The request returned no rows.`);
  }
  return row;
}
