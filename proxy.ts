import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/lib/env";

export const config = {
  matcher: ["/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)"],
};

function isDevBypass(): boolean {
  return env.NODE_ENV !== "production" && env.DEV_BYPASS_AUTH === "1";
}

export default auth((req) => {
  // Production safety: refuse to serve traffic without the Entra app configured.
  if (env.NODE_ENV === "production") {
    if (
      !env.AUTH_SECRET ||
      !env.AUTH_MICROSOFT_ENTRA_ID_ID ||
      !env.AUTH_MICROSOFT_ENTRA_ID_SECRET ||
      !env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID
    ) {
      return new NextResponse(
        "Server misconfigured: AUTH_SECRET + AUTH_MICROSOFT_ENTRA_ID_{ID,SECRET,TENANT_ID} must all be set in production.",
        { status: 500 },
      );
    }
    if (env.DEV_BYPASS_AUTH === "1") {
      return new NextResponse("Server misconfigured: DEV_BYPASS_AUTH is refused in production.", { status: 500 });
    }
  }

  // Dev escape hatch: skip the redirect-to-signin entirely.
  if (isDevBypass()) return NextResponse.next();

  // No session → bounce to Entra sign-in, keeping the original URL as `callbackUrl`
  // so the user lands back where they wanted after authenticating.
  if (!req.auth) {
    const signIn = new URL("/api/auth/signin", req.nextUrl.origin);
    signIn.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
});
