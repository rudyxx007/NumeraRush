import { type Session, createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function hasUsableSupabaseConfig(url: string | undefined, key: string | undefined): boolean {
  if (!url || !key) return false;
  // Templates and unedited .env files contain <project-ref> style placeholders.
  if (url.includes('<') || url.includes('>') || key.includes('<')) return false;
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname.includes('.')
    );
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = hasUsableSupabaseConfig(supabaseUrl, supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. ' +
      'Anonymous sign-in, realtime sync, and matchmaking authentication are disabled.',
  );
}

export const supabase = createClient(
  isSupabaseConfigured && supabaseUrl ? supabaseUrl : 'http://127.0.0.1:54321',
  isSupabaseConfigured && supabaseAnonKey ? supabaseAnonKey : 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

/** Returns a Supabase session, creating an anonymous one on first visit. */
const DEV_USER_ID_KEY = 'numera-rush:dev-user-id';

function getOrCreateDevUserId(): string {
  try {
    const existing = localStorage.getItem(DEV_USER_ID_KEY);
    if (existing) return existing;
    const id = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEV_USER_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function ensureAnonSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) {
    // Dev mode: return a synthetic session so the WebSocket client can authenticate.
    const userId = getOrCreateDevUserId();
    return {
      access_token: `dev:${userId}`,
      refresh_token: '',
      expires_in: 0,
      expires_at: 0,
      token_type: 'bearer',
      user: { id: userId } as Session['user'],
    };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[supabase] getSession failed', error.message);
  }
  if (data.session) return data.session;

  const { data: anonymous, error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError || !anonymous.session) {
    console.error('[supabase] anonymous sign-in failed', signInError?.message);
    return null;
  }
  return anonymous.session;
}

export async function ensureAccessToken(): Promise<string | null> {
  const session = await ensureAnonSession();
  return session?.access_token ?? null;
}
