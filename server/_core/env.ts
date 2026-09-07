// Centralised environment access. Import `ENV` instead of reading `process.env`
// directly so every required variable has a single documented home.
//
// Required in production:
//   VITE_APP_ID            OAuth client / app id
//   JWT_SECRET             HMAC secret used to sign session cookies
//   DATABASE_URL           MySQL/TiDB connection string
//   OAUTH_SERVER_URL       Manus OAuth server base URL
//   OWNER_OPEN_ID          openId that is granted the `admin` role on first login
// Optional:
//   BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY   storage + notification proxy

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
} as const;
