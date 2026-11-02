"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { sendWhatsAppText, toE164, whatsappConfigured } from "@/lib/channels/whatsapp";

const s = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

export type DuplicateState = { error?: string; duplicates?: { id: string; name: string; email: string | null; phone: string | null }[] } | undefined;

/** CRM-03 : contrôle des doublons à la création, avec possibilité de forcer. */
export async function createContact(_: DuplicateState, f: FormData): Promise<DuplicateState> {
  const { supabase, org, user } = await getContext();
  const email = s(f, "email");
  const phone = s(f, "phone");

  if (f.get("force") !== "1" && (email || phone)) {
    const { data: dups } = await supabase.rpc("find_contact_duplicates", { p_org: org.id, p_email: email, p_phone: phone });
    if (dups && dups.length) {
      return {
        duplicates: dups.map((d: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }) => ({
          id: d.id,
          name: [d.first_name, d.last_name].filter(Boolean).join(" ") || d.email || d.phone || "Sans nom",
          email: d.email,
          phone: d.phone,
        })),
      };
    }
  }

  let companyId = s(f, "company_id");
  const companyName = s(f, "company_name");
  if (!companyId && companyName) {
    const { data: existing } = await supabase.from("companies").select("id").eq("org_id", org.id).ilike("name", companyName).limit(1).maybeSingle();
    if (existing) companyId = existing.id;
    else {
      const { data: created, error } = await supabase.from("companies").insert({ org_id: org.id, name: companyName, owner_id: user.id }).select("id").single();
      if (error) return { error: error.message };
      companyId = created.id;
    }
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      org_id: org.id,
      first_name: s(f, "first_name"),
      last_name: s(f, "last_name"),
      email,
      phone,
      job_title: s(f, "job_title"),
      city: s(f, "city"),
      company_id: companyId,
      owner_id: user.id,
      whatsapp_consent: f.get("whatsapp_consent") === "on",
      whatsapp_consent_at: f.get("whatsapp_consent") === "on" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message.includes("contacts_has_identity") ? "Renseignez au moins un nom, un e-mail ou un téléphone." : error.message };

  const fromInbox = s(f, "inbox_item_id");
  if (fromInbox) await supabase.rpc("link_inbox_item", { p_item: fromInbox, p_contact: data.id });

  revalidatePath("/contacts");
  redirect(`/contacts/${data.id}`);
}

export async function updateContact(id: string, f: FormData) {
  const { supabase } = await getContext();
  const custom: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("custom.") && typeof v === "string" && v.trim()) custom[k.slice(7)] = v.trim();
  const newKey = s(f, "new_custom_key");
  if (newKey && s(f, "new_custom_value")) custom[newKey.slice(0, 60)] = s(f, "new_custom_value")!;
  const consent = f.get("whatsapp_consent") === "on";
  const { data: before } = await supabase.from("contacts").select("whatsapp_consent").eq("id", id).single();
  const { error } = await supabase
    .from("contacts")
    .update({
      first_name: s(f, "first_name"),
      last_name: s(f, "last_name"),
      email: s(f, "email"),
      phone: s(f, "phone"),
      job_title: s(f, "job_title"),
      city: s(f, "city"),
      company_id: s(f, "company_id"),
      owner_id: s(f, "owner_id"),
      notes: s(f, "notes"),
      custom,
      whatsapp_consent: consent,
      ...(consent && !before?.whatsapp_consent ? { whatsapp_consent_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function mergeContacts(keepId: string, removeId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("merge_contacts", { p_keep: keepId, p_remove: removeId });
  if (error) throw new Error(error.message);
  revalidatePath("/contacts");
  revalidatePath("/contacts/duplicates");
  revalidatePath(`/contacts/${keepId}`);
}

/** Note, appel ou rendez-vous saisi manuellement (TEL-01 pour les appels). */
export async function logActivity(contactId: string, f: FormData) {
  const { supabase, org, user } = await getContext();
  const type = (s(f, "type") ?? "note") as "note" | "call" | "meeting";
  const { data: c } = await supabase.from("contacts").select("company_id").eq("id", contactId).single();
  const { data: deal } = await supabase.from("deals").select("id").eq("contact_id", contactId).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const minutes = Number(s(f, "duration_minutes") ?? 0);
  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    type,
    direction: type === "note" ? "internal" : "outbound",
    contact_id: contactId,
    company_id: c?.company_id ?? null,
    deal_id: s(f, "deal_id") ?? deal?.id ?? null,
    subject: s(f, "subject"),
    body: s(f, "body"),
    duration_seconds: minutes > 0 ? Math.round(minutes * 60) : null,
    occurred_at: s(f, "occurred_at") ? new Date(s(f, "occurred_at")!).toISOString() : new Date().toISOString(),
    source: "manual",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/contacts/${contactId}`);
}

/** CONV-03 : envoi WhatsApp depuis la fiche, avec contrôle du consentement. */
export async function sendWhatsApp(contactId: string, f: FormData) {
  const { supabase, org, user } = await getContext();
  const text = s(f, "text");
  if (!text) throw new Error("Message vide");
  const { data: c } = await supabase.from("contacts").select("phone, whatsapp_consent, company_id").eq("id", contactId).single();
  if (!c?.phone) throw new Error("Ce contact n'a pas de numéro de téléphone.");
  if (!c.whatsapp_consent) throw new Error("Le contact n'a pas donné son consentement pour WhatsApp.");

  const { data: conn } = await supabase.from("channel_connections").select("config, status").eq("org_id", org.id).eq("provider", "whatsapp").maybeSingle();
  let externalId: string | undefined;
  let simulated = false;
  if (whatsappConfigured(conn?.config)) {
    externalId = await sendWhatsAppText({ phoneNumberId: conn!.config.phone_number_id, to: toE164(c.phone, org.country), text });
  } else {
    simulated = true;
  }
  const { data: deal } = await supabase.from("deals").select("id").eq("contact_id", contactId).eq("status", "open").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("activities").insert({
    org_id: org.id,
    type: "whatsapp",
    direction: "outbound",
    contact_id: contactId,
    company_id: c.company_id,
    deal_id: deal?.id ?? null,
    body: text,
    to_address: c.phone,
    source: "auto",
    channel_provider: "whatsapp",
    external_id: externalId ?? null,
    created_by: user.id,
    meta: simulated ? { simulated: true, note: "WhatsApp non connecté : message journalisé sans envoi" } : {},
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/contacts/${contactId}`);
}

export async function createCompany(f: FormData) {
  const { supabase, org, user } = await getContext();
  const { data, error } = await supabase
    .from("companies")
    .insert({
      org_id: org.id,
      name: s(f, "name") ?? "Sans nom",
      domain: s(f, "domain"),
      phone: s(f, "phone"),
      email: s(f, "email"),
      address: s(f, "address"),
      city: s(f, "city"),
      country: s(f, "country"),
      siren: s(f, "siren"),
      vat_number: s(f, "vat_number"),
      sector: s(f, "sector"),
      owner_id: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/companies");
  redirect(`/companies/${data.id}`);
}

export async function updateCompany(id: string, f: FormData) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from("companies")
    .update({
      name: s(f, "name") ?? "Sans nom",
      domain: s(f, "domain"),
      phone: s(f, "phone"),
      email: s(f, "email"),
      address: s(f, "address"),
      city: s(f, "city"),
      country: s(f, "country"),
      siren: s(f, "siren"),
      vat_number: s(f, "vat_number"),
      sector: s(f, "sector"),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/companies/${id}`);
}
