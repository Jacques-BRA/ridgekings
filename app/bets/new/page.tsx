import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CreateBetForm } from "./CreateBetForm";

export default async function NewBetPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 font-display text-display-xl text-text">Post a New Line</h1>
      <p className="mb-8 text-text-muted">All wagers settled in fake currency. All beefs settled at the watercooler.</p>
      <CreateBetForm />
    </main>
  );
}
