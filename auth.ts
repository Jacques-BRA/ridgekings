import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { env } from "@/lib/env";

// Pin the issuer to a specific tenant so only your company's Entra users can sign in.
// `common` would accept any tenant; we explicitly want single-tenant.
function issuer(): string | undefined {
  if (!env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID) return undefined;
  return `https://login.microsoftonline.com/${env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: issuer(),
      // The default scopes (openid email profile) are enough for our needs:
      // we just need email + display name.
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Defence-in-depth: even with the tenant-pinned issuer, double-check
      // the token's tenant claim matches before letting them in.
      if (!env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID) return true;
      const tid = (profile as { tid?: string } | undefined)?.tid;
      return tid === env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID;
    },
    async jwt({ token, profile }) {
      // Persist display name + email on the token so we don't have to refetch from MS Graph.
      if (profile) {
        token.name = profile.name ?? token.name;
        token.email = (profile.email ?? token.email)?.toString().toLowerCase();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string | null | undefined) ?? session.user.name;
        session.user.email = (token.email as string | null | undefined) ?? session.user.email;
      }
      return session;
    },
  },
});
