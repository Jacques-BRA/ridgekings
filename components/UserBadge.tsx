import { signOut } from "@/auth";

export function UserBadge({ name, isAdmin }: { name: string; isAdmin: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm">
      <span className="font-display tracking-wide uppercase">{name}</span>
      {isAdmin && (
        <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold">Admin</span>
      )}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="ml-1 cursor-pointer text-xs uppercase tracking-wide text-text-dim hover:text-danger"
          title="Sign out — you'll need to sign back in via Entra SSO."
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
