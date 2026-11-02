"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(_: { error?: string } | undefined, formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: String(formData.get("name") ?? "").trim(),
    p_country: String(formData.get("country") ?? "FR"),
    p_currency: String(formData.get("currency") ?? "EUR"),
    p_template: String(formData.get("template") ?? "b2b_services"),
  });
  if (error) return { error: error.message };
  (await cookies()).set("org_id", data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard?welcome=1");
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) redirect(`/invite/${token}?error=${encodeURIComponent(error.message)}`);
  (await cookies()).set("org_id", data as string, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
