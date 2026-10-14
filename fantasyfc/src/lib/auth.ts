import { supabase } from "./supabaseClient";

export async function signInWithGoogle(): Promise<void> {
	const { error } = await supabase.auth.signInWithOAuth({
		provider: "google",
		options: {
			redirectTo: window.location.origin,
		},
	});

	if (error) {
		throw new Error(`Google sign-in failed: ${error.message}`);
	}
}

export async function signOut(): Promise<void> {
	const { error } = await supabase.auth.signOut();

	if (error) {
		throw new Error(`Sign-out failed: ${error.message}`);
	}
}
