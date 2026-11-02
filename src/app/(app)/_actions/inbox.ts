"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";

export async function linkInboxToContact(itemId: string, f: FormData) {
  const { supabase } = await getContext();
  const contactId = String(f.get("contact_id") ?? "");
  if (!contactId) throw new Error("Choisissez un contact");
  const { error } = await supabase.rpc("link_inbox_item", { p_item: itemId, p_contact: contactId });
  if (error) throw new Error(error.message);
  revalidatePath("/inbox");
}

export async function ignoreInboxItem(itemId: string) {
  const { supabase } = await getContext();
  await supabase.from("inbox_items").update({ status: "ignored" }).eq("id", itemId);
  revalidatePath("/inbox");
}
