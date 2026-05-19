import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { env } from "./env";

export interface CfAccessIdentity {
  email: string;
  name: string;
  sub: string;
}

// `jwtVerify`'s second parameter accepts a key resolver function. Its return type
// changed shape in jose v6 (CryptoKey | Uint8Array), so we mirror the parameter
// type directly instead of importing a type alias.
type JwksGetter = Parameters<typeof jwtVerify>[1];

let jwksGetter: JwksGetter | null = null;

function defaultJwksGetter(): JwksGetter {
  if (!env.CF_ACCESS_TEAM_DOMAIN) throw new Error("CF_ACCESS_TEAM_DOMAIN is not configured");
  const url = new URL(`https://${env.CF_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  return createRemoteJWKSet(url, { cacheMaxAge: 15 * 60_000 });
}

function getJwks(): JwksGetter {
  if (!jwksGetter) jwksGetter = defaultJwksGetter();
  return jwksGetter;
}

/** Test hook: install a custom JWKS getter (e.g. from createLocalJWKSet) and reset between tests. */
export function _setJwksGetterForTests(getter: JwksGetter | null): void {
  jwksGetter = getter;
}

function deriveName(payload: JWTPayload, email: string): string {
  const custom = (payload.custom as Record<string, unknown> | undefined) ?? {};
  const candidates = [
    typeof payload.name === "string" ? payload.name : undefined,
    typeof custom.name === "string" ? (custom.name as string) : undefined,
    typeof custom.preferred_username === "string" ? (custom.preferred_username as string) : undefined,
  ];
  for (const c of candidates) {
    if (c && c.trim().length > 0) return c.trim();
  }
  const local = email.split("@")[0] ?? "user";
  return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function verifyCfAccessJwt(token: string): Promise<CfAccessIdentity> {
  if (!env.CF_ACCESS_AUD) throw new Error("CF_ACCESS_AUD is not configured");
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://${env.CF_ACCESS_TEAM_DOMAIN}`,
    audience: env.CF_ACCESS_AUD,
  });
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!email) throw new Error("CF Access JWT missing email claim");
  if (!sub) throw new Error("CF Access JWT missing sub claim");
  return { email, sub, name: deriveName(payload, email) };
}

export function isDevBypass(): boolean {
  return env.NODE_ENV !== "production" && env.DEV_BYPASS_CF_ACCESS === "1";
}

export function devBypassIdentity(): CfAccessIdentity {
  return {
    email: env.DEV_BYPASS_EMAIL ?? "dev@local.test",
    name: env.DEV_BYPASS_NAME ?? "Local Dev",
    sub: "dev-bypass-sub",
  };
}
