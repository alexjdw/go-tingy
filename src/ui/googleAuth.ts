import { Platform } from 'react-native';
import { DRIVE_SCOPE } from '../sync/drive';

/**
 * Google sign-in for the web build (the iPhone version is the web app), with Google's own token client: it needs only a
 * public "Web application" client id (no secret) and gives a one-hour access token for the app's private Drive folder.
 * The token is kept in memory and, so that reloading the page does not ask Google again, in this tab's session storage
 * (gone when the tab closes; it lasts an hour and reaches only the app's private Drive folder). When it runs out, a sync
 * asks Google for a new one, which works without a prompt while the player is still signed in to Google, and otherwise
 * asks them to sign in again. Opening the app never asks by itself: see `cachedToken`.
 */
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

/** Syncing is offered only on the web, and only when a client id was set when the app was built. */
export const syncAvailable = Platform.OS === 'web' && GOOGLE_CLIENT_ID !== '';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback: (e: { type?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

let script: Promise<GoogleGlobal> | null = null;
const loadScript = (): Promise<GoogleGlobal> => {
  script ??= new Promise((resolve, reject) => {
    const g = (window as unknown as { google?: GoogleGlobal }).google;
    if (g?.accounts) return resolve(g);
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.async = true;
    el.onload = () => resolve((window as unknown as { google: GoogleGlobal }).google);
    el.onerror = () => {
      script = null;
      reject(new Error('Could not load Google sign-in (are you online?)'));
    };
    document.head.appendChild(el);
  });
  return script;
};

const STORE = 'gdrive.token';
type Token = { value: string; expiresAt: number };

const readStored = (): Token | null => {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE) ?? 'null') as Partial<Token> | null;
    return v && typeof v.value === 'string' && typeof v.expiresAt === 'number' ? (v as Token) : null;
  } catch {
    return null;
  }
};
const writeStored = (t: Token | null) => {
  try {
    if (t) sessionStorage.setItem(STORE, JSON.stringify(t));
    else sessionStorage.removeItem(STORE);
  } catch {
    // storage blocked: the token then lives in memory only
  }
};

let token: Token | null = Platform.OS === 'web' && typeof sessionStorage !== 'undefined' ? readStored() : null;
const usable = (t: Token | null): t is Token => !!t && t.expiresAt - 60_000 > Date.now();
let pending: Promise<string | null> | null = null;

/** Ask Google for an access token. `prompt` '' = silently if possible, 'consent' = show the permission screen. */
function request(prompt: '' | 'consent'): Promise<string | null> {
  pending ??= loadScript()
    .then(
      (g) =>
        new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 20000);
          const done = (v: string | null) => {
            clearTimeout(timer);
            resolve(v);
          };
          g.accounts.oauth2
            .initTokenClient({
              client_id: GOOGLE_CLIENT_ID,
              scope: DRIVE_SCOPE,
              callback: (r) => {
                if (r.access_token) {
                  token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
                  writeStored(token);
                  done(r.access_token);
                } else done(null);
              },
              error_callback: () => done(null),
            })
            .requestAccessToken({ prompt });
        }),
    )
    .catch(() => null)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Sign in (call this from a tap: browsers block the Google window otherwise). Null if the player cancelled. */
export const signIn = (prompt: '' | 'consent' = 'consent') => request(prompt);

/** A token that is still good, with no request to Google at all (and so no window); null if there is none. */
export const cachedToken = (): string | null => (usable(token) ? token.value : null);

/** A usable access token, or null if the player has to sign in again. */
export async function getToken(): Promise<string | null> {
  return cachedToken() ?? request('');
}

export async function signOut(): Promise<void> {
  const t = token?.value;
  token = null;
  writeStored(null);
  if (!t) return;
  try {
    (await loadScript()).accounts.oauth2.revoke(t);
  } catch {
    // offline: the token expires on its own within the hour
  }
}
