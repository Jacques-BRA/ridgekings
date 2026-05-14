"use client";

import { useState, useTransition } from "react";
import { selectOrCreateUser, logoutAction } from "@/app/actions/auth";

export function UserPicker({
  currentName,
  users,
  isAdmin,
}: {
  currentName: string | null;
  users: { id: number; name: string }[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");

  function pick(name: string) {
    const fd = new FormData();
    fd.set("name", name);
    startTransition(() => {
      void selectOrCreateUser(fd);
      setOpen(false);
    });
  }

  function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    pick(newName.trim());
    setNewName("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-border-strong bg-bg-surface px-3 py-2 text-sm hover:bg-bg-elevated"
        disabled={pending}
      >
        <span className="font-display tracking-wide uppercase">{currentName ?? "Pick a user"}</span>
        {isAdmin && <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gold">Admin</span>}
        <span className="text-text-dim">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-md border border-border-strong bg-bg-elevated p-2 shadow-xl">
          <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-text-dim">Existing users</div>
          <ul className="max-h-48 overflow-y-auto">
            {users.length === 0 && <li className="px-2 py-1 text-sm text-text-dim">No one yet — create yourself below.</li>}
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => pick(u.name)}
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-bg-surface"
                >
                  {u.name}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={createUser} className="mt-2 border-t border-border pt-2">
            <label className="px-2 text-[10px] uppercase tracking-widest text-text-dim">Create new user</label>
            <div className="mt-1 flex gap-2 px-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Your name"
                className="flex-1 rounded border border-border-strong bg-bg-surface px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                maxLength={40}
              />
              <button type="submit" className="rounded bg-primary px-3 py-1 text-sm font-display uppercase text-black hover:bg-primary-hover">
                Go
              </button>
            </div>
          </form>
          {currentName && (
            <form action={logoutAction} className="mt-2 border-t border-border pt-2 px-2">
              <button type="submit" className="text-xs uppercase tracking-wide text-text-dim hover:text-danger">
                Sign out
              </button>
            </form>
          )}
          <div className="mt-2 border-t border-border pt-2 px-2">
            <span className="block text-[10px] uppercase tracking-widest text-text-dim line-through">Build a Parlay (Premium)</span>
          </div>
        </div>
      )}
    </div>
  );
}
