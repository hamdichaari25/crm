"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export async function createDeal(f: FormData) {
  const { supabase, org, user } = await getContext();
  const pipelineId = s(f, "pipeline_id");
  let stageId = s(f, "stage_id");
  if (!pipelineId) throw new Error("Pipeline requis");
  if (!stageId) {
    const { data } = await supabase.from("stages").select("id").eq("pipeline_id", pipelineId).order("position").limit(1).single();
    stageId = data?.id ?? null;
  }
  let companyId = s(f, "company_id");
  const contactId = s(f, "contact_id");
  if (!companyId && contactId) {
    const { data: c } = await supabase.from("contacts").select("company_id").eq("id", contactId).single();
    companyId = c?.company_id ?? null;
  }
  const { data, error } = await supabase
    .from("deals")
    .insert({
      org_id: org.id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      title: s(f, "title") ?? "Nouvelle opportunité",
      amount: Number(s(f, "amount") ?? 0),
      currency: s(f, "currency") ?? org.default_currency,
      expected_close_date: s(f, "expected_close_date"),
      contact_id: contactId,
      company_id: companyId,
      owner_id: s(f, "owner_id") ?? user.id,
      source: (s(f, "source") as "manual" | "ai" | null) ?? "manual",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
  if (f.get("stay") === "1") return;
  redirect(`/deals/${data.id}`);
}

/** PIP-01 : déplacement Kanban (visible par l'équipe via Realtime). */
export async function moveDeal(dealId: string, stageId: string, position: number) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("deals").update({ stage_id: stageId, position }).eq("id", dealId);
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
}

export async function updateDeal(id: string, f: FormData) {
  const { supabase } = await getContext();
  const prob = s(f, "probability");
  const { error } = await supabase
    .from("deals")
    .update({
      title: s(f, "title") ?? "Sans titre",
      amount: Number(s(f, "amount") ?? 0),
      currency: s(f, "currency") ?? "EUR",
      expected_close_date: s(f, "expected_close_date"),
      probability: prob === null ? null : Math.max(0, Math.min(100, Number(prob))),
      stage_id: s(f, "stage_id") ?? undefined,
      owner_id: s(f, "owner_id"),
      contact_id: s(f, "contact_id"),
      company_id: s(f, "company_id"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/deals/${id}`);
  revalidatePath("/pipeline");
}

export async function deleteDeal(id: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("deals").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
  redirect("/pipeline");
}

export async function createQuoteFromDeal(dealId: string) {
  const { supabase } = await getContext();
  const { data, error } = await supabase.rpc("create_quote_from_deal", { p_deal: dealId });
  if (error) throw new Error(error.message);
  redirect(`/quotes/${data}`);
}
