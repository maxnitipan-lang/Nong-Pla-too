// Shared constants and helpers used by BOTH the server and the browser bundle.
// Keep this file free of Node- or DOM-only APIs beyond the widely-available
// atob/btoa (present in modern browsers and Node >= 16).

export const COOKIE_NAME = "app_session_id";

export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;

export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// __Host- prefix keeps the cookie locked to this exact origin, path "/", Secure.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

export type OAuthState = {
  redirectUri: string;
  /** One-time nonce mirrored in OAUTH_STATE_COOKIE and checked on callback. */
  nonce?: string;
};

/** Serialize the OAuth `state` param. Inverse of `decodeOAuthState`. */
export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

/** Parse the OAuth `state` param. Tolerates a bare redirect URI for older links. */
export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as OAuthState).redirectUri === "string"
    ) {
      return parsed as OAuthState;
    }
  } catch {
    // Not JSON — fall through and treat the decoded payload as a redirect URI.
  }
  return { redirectUri: decoded };
};
