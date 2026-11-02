"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { analyzeConversation } from "@/lib/ai/analyze";

/**
 * IA-01 / IA-02 / IA-03 : analyse du fil d'un contact.
 * Produit des propositions « en attente », chacune avec ses messages d'origine.
 */
export async function analyzeContact(contactId: string) {
  const { supabase, org } = await getContext();
  const [{ data: contact }, { data: acts }, { data: deal }] = await Promise.all([
    supabase.from("contacts").select("id, first_name, last_name, email, phone, job_title, city, company:companies(name)").eq("id", contactId).single(),
    supabase
      .from("activities")
      .select("id, type, direction, occurred_at, subject, body")
      .eq("contact_id", contactId)
      .in("type", ["email", "whatsapp", "call", "meeting", "note"])
      .order("occurred_at", { ascending: false })
      .limit(40),
    supabase.from("deals").select("id, title, amount, currency, expected_close_date, stage:stages(name)").eq("contact_id", contactId).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!contact) throw new Error("Contact introuvable");
  const messages = (acts ?? []).reverse();
  if (messages.length === 0) throw new Error("Aucun échange à analyser pour ce contact.");

  const { analysis, model } = await analyzeConversation({
    orgName: org.name,
    currency: org.default_currency,
    today: new Date().toISOString().slice(0, 10),
    contact: { ...contact, company_name: (contact.company as unknown as { name: string } | null)?.name ?? null, company: undefined },
    openDeal: deal ?? null,
    messages,
  });

  // On remplace les propositions encore en attente pour ce contact
  await supabase.from("ai_suggestions").delete().eq("contact_id", contactId).eq("status", "pending");

  const rows: Record<string, unknown>[] = [];
  const base = { org_id: org.id, contact_id: contactId, model };
  rows.push({
    ...base,
    kind: "summary",
    target_type: "contact",
    target_id: contactId,
    payload: analysis.summary,
    source_activity_ids: [...new Set(analysis.summary.points.flatMap((p) => p.source_ids))],
  });
  for (const fu of analysis.field_updates) {
    if (fu.target === "deal" && !deal) continue;
    rows.push({
      ...base,
      kind: "field_update",
      target_type: fu.target,
      target_id: fu.target === "deal" ? deal!.id : contactId,
      deal_id: fu.target === "deal" ? deal!.id : null,
      payload: fu,
      source_activity_ids: fu.source_ids,
    });
  }
  if (analysis.deal_proposal && !deal) {
    rows.push({ ...base, kind: "create_deal", target_type: "contact", target_id: contactId, payload: analysis.deal_proposal, source_activity_ids: analysis.deal_proposal.source_ids });
  }
  if (analysis.next_action) {
    rows.push({ ...base, kind: "next_action", target_type: "contact", target_id: contactId, deal_id: deal?.id ?? null, payload: analysis.next_action, source_activity_ids: analysis.next_action.source_ids });
  }
  if (analysis.draft) {
    rows.push({ ...base, kind: "draft", target_type: "contact", target_id: contactId, payload: analysis.draft, source_activity_ids: [] });
  }
  const { error } = await supabase.from("ai_suggestions").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/inbox");
}

type Suggestion = {
  id: string;
  org_id: string;
  kind: string;
  target_type: string;
  target_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  payload: Record<string, unknown>;
  previous_value: Record<string, unknown> | null;
};

/** Accepter une proposition (éventuellement modifiée). L'ancienne valeur est conservée pour annuler. */
export async function acceptSuggestion(id: string, f?: FormData) {
  const { supabase, org, user } = await getContext();
  const { data: sug } = await supabase.from("ai_suggestions").select("*").eq("id", id).single<Suggestion>();
  if (!sug || sug.org_id !== org.id) throw new Error("Proposition introuvable");
  const edited = f?.get("value") as string | null;
  let previous: Record<string, unknown> | null = null;
  let modified = false;
  const payload = { ...sug.payload };

  if (sug.kind === "field_update") {
    const field = String(payload.field);
    const table = sug.target_type === "deal" ? "deals" : "contacts";
    const { data: cur } = await supabase.from(table).select(field).eq("id", sug.target_id!).single();
    previous = { [field]: (cur as Record<string, unknown> | null)?.[field] ?? null };
    let value: unknown = edited ?? payload.value;
    if (edited !== null && edited !== undefined && edited !== payload.value) modified = true;
    if (field === "amount") value = Number(String(value).replace(/[^\d.,-]/g, "").replace(",", "."));
    const { error } = await supabase.from(table).update({ [field]: value }).eq("id", sug.target_id!);
    if (error) throw new Error(error.message);
    payload.applied_value = value;
  } else if (sug.kind === "create_deal") {
    const { data: pipe } = await supabase.from("pipelines").select("id").eq("org_id", org.id).order("is_default", { ascending: false }).limit(1).single();
    const { data: stage } = await supabase.from("stages").select("id").eq("pipeline_id", pipe!.id).order("position").limit(1).single();
    const { data: c } = await supabase.from("contacts").select("company_id").eq("id", sug.contact_id!).single();
    const title = (f?.get("title") as string) || String(payload.title);
    if (title !== payload.title) modified = true;
    const { data: d, error } = await supabase
      .from("deals")
      .insert({
        org_id: org.id,
        pipeline_id: pipe!.id,
        stage_id: stage!.id,
        title,
        amount: Number(f?.get("amount") ?? payload.amount ?? 0) || 0,
        currency: org.default_currency,
        expected_close_date: (payload.expected_close_date as string) || null,
        contact_id: sug.contact_id,
        company_id: c?.company_id ?? null,
        owner_id: user.id,
        source: "ai",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    previous = { created_deal_id: d.id };
    await supabase.from("activities").update({ deal_id: d.id }).eq("contact_id", sug.contact_id!).is("deal_id", null);
  } else if (sug.kind === "next_action") {
    const days = Number(f?.get("due_in_days") ?? payload.due_in_days ?? 1);
    const title = (f?.get("title") as string) || String(payload.title);
    if (title !== payload.title || days !== payload.due_in_days) modified = true;
    const { data: t, error } = await supabase
      .from("tasks")
      .insert({ org_id: org.id, title, due_at: new Date(Date.now() + days * 86400000).toISOString(), assignee_id: user.id, contact_id: sug.contact_id, deal_id: sug.deal_id, source: "ai", created_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    previous = { created_task_id: t.id };
  }
  // summary et draft : l'acceptation vaut validation (le brouillon est envoyé par l'utilisateur lui-même)

  const { error } = await supabase
    .from("ai_suggestions")
    .update({ status: "accepted", decided_by: user.id, decided_at: new Date().toISOString(), previous_value: previous, payload, modified_before_accept: modified })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (sug.contact_id) revalidatePath(`/contacts/${sug.contact_id}`);
  revalidatePath("/inbox");
}

export async function rejectSuggestion(id: string) {
  const { supabase, user } = await getContext();
  const { data: sug } = await supabase.from("ai_suggestions").update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id).select("contact_id").single();
  if (sug?.contact_id) revalidatePath(`/contacts/${sug.contact_id}`);
  revalidatePath("/inbox");
}

/** Annuler une proposition acceptée : restaure la valeur précédente. */
export async function revertSuggestion(id: string) {
  const { supabase, user } = await getContext();
  const { data: sug } = await supabase.from("ai_suggestions").select("*").eq("id", id).single<Suggestion>();
  if (!sug) throw new Error("Proposition introuvable");
  const prev = sug.previous_value ?? {};
  if (sug.kind === "field_update" && sug.target_id) {
    const table = sug.target_type === "deal" ? "deals" : "contacts";
    const { error } = await supabase.from(table).update(prev).eq("id", sug.target_id);
    if (error) throw new Error(error.message);
  } else if (sug.kind === "create_deal" && prev.created_deal_id) {
    await supabase.from("deals").delete().eq("id", prev.created_deal_id as string);
  } else if (sug.kind === "next_action" && prev.created_task_id) {
    await supabase.from("tasks").delete().eq("id", prev.created_task_id as string);
  }
  await supabase.from("ai_suggestions").update({ status: "reverted", decided_by: user.id, decided_at: new Date().toISOString() }).eq("id", id);
  if (sug.contact_id) revalidatePath(`/contacts/${sug.contact_id}`);
}
