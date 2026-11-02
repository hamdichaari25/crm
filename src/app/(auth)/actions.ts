"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; info?: string } | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: error.message === "Invalid login credentials" ? "E-mail ou mot de passe incorrect." : error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const next = safeNext(formData.get("next") || "/onboarding");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Le mot de passe doit contenir au moins 10 caractères." };

  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? "").trim(),
    password,
    options: {
      data: { full_name: String(formData.get("full_name") ?? "").trim() },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: error.message };
  if (!data.session) return { info: "Vérifiez votre boîte mail : un lien de confirmation vient de vous être envoyé." };
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function verifyMfa(_: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) redirect("/dashboard");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: String(formData.get("code") ?? "").trim() });
  if (error) return { error: "Code invalide." };
  redirect(safeNext(formData.get("next")));
}
