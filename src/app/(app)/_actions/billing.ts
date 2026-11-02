"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { getEInvoiceProvider } from "@/lib/einvoice";

const num = (f: FormData, k: string, d = 0) => {
  const v = Number(String(f.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : d;
};

export async function addQuoteLine(quoteId: string, f: FormData) {
  const { supabase, org } = await getContext();
  const productId = (f.get("product_id") as string) || null;
  let description = String(f.get("description") ?? "").trim();
  let unitPrice = num(f, "unit_price");
  let taxRate = num(f, "tax_rate", 20);
  if (productId) {
    const { data: p } = await supabase.from("products").select("name, unit_price, tax_rate").eq("id", productId).single();
    if (p) {
      description ||= p.name;
      if (!f.get("unit_price")) unitPrice = Number(p.unit_price);
      if (!f.get("tax_rate")) taxRate = Number(p.tax_rate);
    }
  }
  if (!description) throw new Error("Description requise");
  const { count } = await supabase.from("quote_lines").select("id", { count: "exact", head: true }).eq("quote_id", quoteId);
  const { error } = await supabase.from("quote_lines").insert({
    org_id: org.id,
    quote_id: quoteId,
    product_id: productId,
    description,
    quantity: num(f, "quantity", 1),
    unit_price: unitPrice,
    tax_rate: taxRate,
    position: (count ?? 0) + 1,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function deleteQuoteLine(quoteId: string, lineId: string) {
  const { supabase } = await getContext();
  const { error } = await supabase.from("quote_lines").delete().eq("id", lineId);
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function updateQuote(quoteId: string, f: FormData) {
  const { supabase } = await getContext();
  const { error } = await supabase
    .from("quotes")
    .update({ notes: (f.get("notes") as string) || null, valid_until: (f.get("valid_until") as string) || undefined, currency: (f.get("currency") as string) || undefined })
    .eq("id", quoteId)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
}

export async function setQuoteStatus(quoteId: string, status: "sent" | "accepted" | "refused" | "draft") {
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("set_quote_status", { p_quote: quoteId, p_status: status });
  if (error) throw new Error(error.message);
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/pipeline");
}

/** FACT-02 : devis accepté → facture, sans ressaisie. */
export async function convertQuoteToInvoice(quoteId: string) {
  const { supabase } = await getContext();
  const { data, error } = await supabase.rpc("convert_quote_to_invoice", { p_quote: quoteId });
  if (error) throw new Error(error.message);
  revalidatePath("/invoices");
  redirect(`/invoices/${data}`);
}

export async function createProduct(f: FormData) {
  const { supabase, org } = await getContext();
  const { error } = await supabase.from("products").insert({
    org_id: org.id,
    name: String(f.get("name") ?? "").trim() || "Produit",
    unit_price: num(f, "unit_price"),
    tax_rate: num(f, "tax_rate", 20),
    currency: (f.get("currency") as string) || org.default_currency,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/products");
}

export async function issueInvoice(invoiceId: string) {
  const { supabase, role } = await getContext();
  if (!["admin", "finance", "manager"].includes(role)) throw new Error("Seuls l'administration et la finance peuvent émettre une facture.");
  const { error } = await supabase.from("invoices").update({ status: "issued", issue_date: new Date().toISOString().slice(0, 10) }).eq("id", invoiceId).eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
}

async function recordStatus(invoiceId: string, status: string, message: string | null, extra: Record<string, unknown> = {}) {
  const { supabase, org } = await getContext();
  const map: Record<string, string> = { deposited: "transmitted", delivered: "delivered", received: "delivered", rejected: "rejected", paid: "paid" };
  const { data: inv, error } = await supabase
    .from("invoices")
    .update({ platform_status: status, ...(map[status] ? { status: map[status] } : {}), ...extra })
    .eq("id", invoiceId)
    .select("number, contact_id, company_id, deal_id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("invoice_events").insert({ org_id: org.id, invoice_id: invoiceId, status, message });
  await supabase.from("activities").insert({
    org_id: org.id,
    type: "invoice",
    contact_id: inv.contact_id,
    company_id: inv.company_id,
    deal_id: inv.deal_id,
    subject: `Facture ${inv.number} : ${status}`,
    body: message,
    source: "auto",
    channel_provider: "einvoice",
    meta: { invoice_id: invoiceId },
  });
}

/** FACT-03 : transmission à la plateforme agréée partenaire. */
export async function transmitInvoice(invoiceId: string) {
  const { supabase, org } = await getContext();
  const [{ data: inv }, { data: lines }, { data: conn }, { data: orgFull }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).single(),
    supabase.from("invoice_lines").select("description, quantity, unit_price, tax_rate").eq("invoice_id", invoiceId).order("position"),
    supabase.from("channel_connections").select("config").eq("org_id", org.id).eq("provider", "einvoice").maybeSingle(),
    supabase.from("organizations").select("name, siren, vat_number, address").eq("id", org.id).single(),
  ]);
  if (!inv) throw new Error("Facture introuvable");
  if (inv.status === "draft") throw new Error("Émettez la facture avant de la transmettre.");
  const provider = getEInvoiceProvider(conn?.config?.provider);
  const result = await provider.transmit({
    number: inv.number,
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    currency: inv.currency,
    seller: { name: orgFull!.name, siren: orgFull!.siren, vatNumber: orgFull!.vat_number, address: orgFull!.address },
    buyer: inv.customer,
    lines: (lines ?? []).map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), taxRate: Number(l.tax_rate) })),
    totals: { subtotal: Number(inv.subtotal), tax: Number(inv.tax_total), total: Number(inv.total) },
  });
  await recordStatus(invoiceId, result.status, result.message ?? null, {
    platform: provider.id,
    platform_ref: result.platformRef,
    transmitted_at: new Date().toISOString(),
  });
  revalidatePath(`/invoices/${invoiceId}`);
}

/** Bac à sable : simule le retour de statut de la plateforme. */
export async function simulateInvoiceStatus(invoiceId: string, status: "delivered" | "paid" | "rejected") {
  const labels = { delivered: "Facture mise à disposition du client (simulation)", paid: "Paiement encaissé (simulation)", rejected: "Facture rejetée par le destinataire (simulation)" };
  await recordStatus(invoiceId, status, labels[status]);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function markInvoicePaid(invoiceId: string) {
  await recordStatus(invoiceId, "paid", "Paiement enregistré manuellement");
  revalidatePath(`/invoices/${invoiceId}`);
}
