"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canAdmin, getContext } from "@/lib/context";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

async function requireAdmin() {
  const ctx = await getContext();
  if (!canAdmin(ctx.role)) throw new Error("Action réservée aux administrateurs et responsables.");
  return ctx;
}

export async function switchOrg(f: FormData) {
  const id = s(f, "org_id");
  if (id) (await cookies()).set("org_id", id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

export async function updateOrg(f: FormData) {
  const { supabase, org } = await getContext();
  const { error } = await supabase
    .from("organizations")
    .update({ name: s(f, "name") ?? org.name, siren: s(f, "siren"), vat_number: s(f, "vat_number"), address: s(f, "address"), default_currency: s(f, "default_currency") ?? org.default_currency })
    .eq("id", org.id);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

export async function inviteMember(f: FormData) {
  const { supabase, org, user } = await requireAdmin();
  const email = s(f, "email");
  if (!email) throw new Error("E-mail requis");
  const { error } = await supabase.from("invitations").insert({ org_id: org.id, email: email.toLowerCase(), role: (s(f, "role") ?? "sales") as "sales", invited_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

export async function revokeInvitation(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("invitations").delete().eq("id", id);
  revalidatePath("/settings/team");
}

export async function changeRole(userId: string, f: FormData) {
  const { supabase, org } = await requireAdmin();
  const { error } = await supabase.from("memberships").update({ role: s(f, "role") as "sales" }).eq("org_id", org.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

export async function removeMember(userId: string) {
  const { supabase, org, user } = await requireAdmin();
  if (userId === user.id) throw new Error("Vous ne pouvez pas vous retirer vous-même.");
  const { error } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/team");
}

/** PIP-02 : pipelines et étapes configurables sans assistance. */
export async function createPipeline(f: FormData) {
  const { supabase, org } = await requireAdmin();
  const stages = String(f.get("stages") ?? "")
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);
  const { error } = await supabase.rpc("create_pipeline", { p_org: org.id, p_name: s(f, "name") ?? "Nouveau pipeline", p_stages: stages.length ? stages : ["Qualification", "Proposition", "Négociation"] });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
}

export async function updateStage(stageId: string, f: FormData) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("stages")
    .update({ name: s(f, "name") ?? "Étape", probability: Math.max(0, Math.min(100, Number(s(f, "probability") ?? 0))), position: Number(s(f, "position") ?? 0) })
    .eq("id", stageId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
}

export async function addStage(pipelineId: string, f: FormData) {
  const { supabase, org } = await requireAdmin();
  const { data: last } = await supabase.from("stages").select("position").eq("pipeline_id", pipelineId).eq("kind", "open").order("position", { ascending: false }).limit(1).maybeSingle();
  const pos = (last?.position ?? 0) + 0.5;
  const { error } = await supabase.from("stages").insert({ org_id: org.id, pipeline_id: pipelineId, name: s(f, "name") ?? "Nouvelle étape", position: pos, probability: Number(s(f, "probability") ?? 50) });
  if (error) throw new Error(error.message);
  // renumérotation
  const { data: all } = await supabase.from("stages").select("id").eq("pipeline_id", pipelineId).order("position");
  await Promise.all((all ?? []).map((st, i) => supabase.from("stages").update({ position: i + 1 }).eq("id", st.id)));
  revalidatePath("/settings/pipelines");
}

export async function deleteStage(stageId: string) {
  const { supabase } = await requireAdmin();
  const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("stage_id", stageId);
  if (count) throw new Error("Déplacez d'abord les opportunités de cette étape.");
  const { error } = await supabase.from("stages").delete().eq("id", stageId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings/pipelines");
}

export async function renamePipeline(pipelineId: string, f: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from("pipelines").update({ name: s(f, "name") ?? "Pipeline" }).eq("id", pipelineId);
  revalidatePath("/settings/pipelines");
}

/** AUTO-01 / AUTO-02 */
export async function createRule(f: FormData) {
  const { supabase, org } = await requireAdmin();
  const trigger = s(f, "trigger") ?? "deal_stage_changed";
  const action = s(f, "action") ?? "create_task";
  const conditions: Record<string, string> = {};
  if (s(f, "stage_id")) conditions.stage_id = s(f, "stage_id")!;
  if (s(f, "pipeline_id")) conditions.pipeline_id = s(f, "pipeline_id")!;
  const action_config =
    action === "create_task"
      ? { title: s(f, "task_title") ?? "Relancer", due_in_days: Number(s(f, "due_in_days") ?? 2) }
      : { strategy: "round_robin", user_ids: f.getAll("user_ids").map(String) };
  const { error } = await supabase.from("automation_rules").insert({ org_id: org.id, name: s(f, "name") ?? "Règle", trigger, action, conditions, action_config });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/automations");
}

export async function toggleRule(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("automation_rules").update({ active }).eq("id", id);
  revalidatePath("/settings/automations");
}

export async function deleteRule(id: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("automation_rules").delete().eq("id", id);
  revalidatePath("/settings/automations");
}

export async function saveChannel(provider: "whatsapp" | "einvoice" | "gmail" | "microsoft365" | "telephony", f: FormData) {
  const { supabase, org, user } = await requireAdmin();
  const config: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("config.") && typeof v === "string" && v.trim()) config[k.slice(7)] = v.trim();
  const { error } = await supabase
    .from("channel_connections")
    .upsert({ org_id: org.id, provider, label: s(f, "label"), config, status: Object.keys(config).length ? "connected" : "pending", connected_by: user.id }, { onConflict: "org_id,provider" });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/channels");
}

export async function updateProfile(f: FormData) {
  const { supabase, user } = await getContext();
  await supabase.from("profiles").update({ full_name: s(f, "full_name") }).eq("id", user.id);
  revalidatePath("/settings");
}
