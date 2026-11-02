"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";

export async function createTask(f: FormData) {
  const { supabase, org, user } = await getContext();
  const title = String(f.get("title") ?? "").trim();
  if (!title) throw new Error("Titre requis");
  const due = String(f.get("due_at") ?? "");
  const { error } = await supabase.from("tasks").insert({
    org_id: org.id,
    title,
    due_at: due ? new Date(due).toISOString() : null,
    assignee_id: (f.get("assignee_id") as string) || user.id,
    contact_id: (f.get("contact_id") as string) || null,
    deal_id: (f.get("deal_id") as string) || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  if (f.get("contact_id")) revalidatePath(`/contacts/${f.get("contact_id")}`);
  if (f.get("deal_id")) revalidatePath(`/deals/${f.get("deal_id")}`);
}

export async function toggleTask(id: string, done: boolean) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
}
