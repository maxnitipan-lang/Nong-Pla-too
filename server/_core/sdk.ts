import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import {
  AXIOS_TIMEOUT_MS,
  COOKIE_NAME,
  ONE_YEAR_MS,
  decodeOAuthState,
} from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";

const EXCHANGE_TOKEN_PATH = "/webdev.v1.WebDevAuthPublicService/ExchangeToken";
const GET_USER_INFO_PATH = "/webdev.v1.WebDevAuthPublicService/GetUserInfo";
const GET_USER_INFO_WITH_JWT_PATH =
  "/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt";

const CRON_OPEN_ID_PREFIX = "cron_";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type TokenResponse = {
  accessToken: string;
  [key: string]: unknown;
};

export type ManusUserInfo = {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
  platforms?: string[];
  taskUid?: string | null;
  [key: string]: unknown;
};

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

export type AuthenticatedUser = User & {
  taskUid?: string;
  isCron?: boolean;
};

type SignSessionOptions = {
  name?: string;
  expiresInMs?: number;
};

class OAuthService {
  constructor(private readonly client: AxiosInstance) {
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable.",
      );
    }
  }

  decodeState(state: string): string {
    return decodeOAuthState(state).redirectUri;
  }

  async getTokenByCode(code: string, state: string): Promise<TokenResponse> {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };
    const { data } = await this.client.post<TokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload,
    );
    return data;
  }

  async getUserInfoByToken(token: { accessToken: string }): Promise<ManusUserInfo> {
    const { data } = await this.client.post<ManusUserInfo>(GET_USER_INFO_PATH, {
      accessToken: token.accessToken,
    });
    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

export class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback?: string | null,
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(platforms.filter((p): p is string => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /** Exchange an OAuth authorization code for an access token. */
  async exchangeCodeForToken(code: string, state: string): Promise<TokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /** Fetch user info with an access token. */
  async getUserInfo(accessToken: string): Promise<ManusUserInfo> {
    const data = await this.oauthService.getUserInfoByToken({ accessToken });
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return { ...data, platform: loginMethod, loginMethod };
  }

  private parseCookies(cookieHeader?: string): Map<string, string> {
    if (!cookieHeader) return new Map();
    const entries = Object.entries(parseCookieHeader(cookieHeader)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );
    return new Map(entries);
  }

  private getSessionSecret(): Uint8Array {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  /** Create a signed session token for a Manus user openId. */
  async createSessionToken(
    openId: string,
    options: SignSessionOptions = {},
  ): Promise<string> {
    return this.signSession(
      { openId, appId: ENV.appId, name: options.name || "" },
      options,
    );
  }

  private async signSession(
    payload: SessionPayload,
    options: SignSessionOptions = {},
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue?: string): Promise<SessionPayload | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), {
        algorithms: ["HS256"],
      });
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return { openId, appId, name };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(jwtToken: string): Promise<ManusUserInfo> {
    const { data } = await this.client.post<ManusUserInfo>(GET_USER_INFO_WITH_JWT_PATH, {
      jwtToken,
      projectId: ENV.appId,
    });
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return { ...data, platform: loginMethod, loginMethod };
  }

  /**
   * Resolve the current user from an incoming request. Reads the session from
   * the cookie (or a `Bearer` header fallback), verifies it, and lazily syncs
   * the user record from OAuth on first sight. Throws (403) when unauthenticated.
   */
  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      if (!userInfo.taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }

    const signedInAt = new Date();
    let user = await getUserByOpenId(session.openId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt,
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }

    await upsertUser({ openId: user.openId, lastSignedIn: signedInAt });
    return user;
  }
}

function buildCronUser(userInfo: ManusUserInfo): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  };
}

export const sdk = new SDKServer();
