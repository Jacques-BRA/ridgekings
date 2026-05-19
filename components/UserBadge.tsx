import { cfAccessLogoutUrl } from "@/lib/auth";

export function UserBadge({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  const logoutUrl = cfAccessLogoutUrl();
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm">
      <span className="font-display tracking-wide uppercase">{name}</span>
      {isAdmin && (
        <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold">Admin</span>
      )}
      {logoutUrl && (
        <a
          href={logoutUrl}
          className="ml-1 text-xs uppercase tracking-wide text-text-dim hover:text-danger"
          title="Sign out of Cloudflare Access — you'll need to sign back in via SSO."
        >
          Sign out
        </a>
      )}
    </div>
  );
}
