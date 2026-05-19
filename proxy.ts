import { NextRequest, NextResponse } from "next/server";
import { devBypassIdentity, isDevBypass, verifyCfAccessJwt } from "@/lib/cf-access";
import { env } from "@/lib/env";

export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"],
};

const HEADER_EMAIL = "x-rk-user-email";
const HEADER_NAME = "x-rk-user-name";
const HEADER_SUB = "x-rk-user-sub";
const JWT_HEADER = "cf-access-jwt-assertion";
const COOKIE_FALLBACK = "CF_Authorization";

export async function proxy(req: NextRequest) {
  // Production safety: refuse to serve traffic if the operator hasn't configured CF Access.
  if (env.NODE_ENV === "production") {
    if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) {
      return new NextResponse(
        "Server misconfigured: CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set in production.",
        { status: 500 },
      );
    }
    if (env.DEV_BYPASS_CF_ACCESS === "1") {
      return new NextResponse("Server misconfigured: DEV_BYPASS_CF_ACCESS is refused in production.", { status: 500 });
    }
  }

  let identity;
  if (isDevBypass()) {
    identity = devBypassIdentity();
  } else {
    const token = req.headers.get(JWT_HEADER) ?? req.cookies.get(COOKIE_FALLBACK)?.value;
    if (!token) {
      return new NextResponse("Unauthorized: no Cloudflare Access JWT on request", { status: 401 });
    }
    try {
      identity = await verifyCfAccessJwt(token);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "JWT verification failed";
      return new NextResponse(`Unauthorized: ${reason}`, { status: 401 });
    }
  }
  const headers = new Headers(req.headers);
  headers.set(HEADER_EMAIL, identity.email);
  headers.set(HEADER_NAME, identity.name);
  headers.set(HEADER_SUB, identity.sub);
  return NextResponse.next({ request: { headers } });
}
