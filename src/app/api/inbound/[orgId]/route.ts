import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * Point d'entrée générique de capture (CONV-01, CONV-02, TEL-01) :
 * e-mails, rendez-vous, appels poussés par une passerelle (Make, n8n, Power Automate, Aircall…).
 * Authentification : en-tête x-fil-secret = secret d'organisation.
 */
const Message = z.object({
  channel: z.enum(["email", "whatsapp", "call", "meeting"]),
  direction: z.enum(["inbound", "outbound"]).default("inbound"),
  from: z.string().max(320).optional().nullable(),
  to: z.string().max(2000).optional().nullable(),
  from_name: z.string().max(200).optional().nullable(),
  subject: z.string().max(1000).optional().nullable(),
  body: z.string().max(100_000).optional().nullable(),
  occurred_at: z.string().datetime({ offset: true }).optional().nullable(),
  external_id: z.string().max(500).optional().nullable(),
  duration_seconds: z.number().int().min(0).optional().nullable(),
  provider: z.string().max(50).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/inbound/[orgId]">) {
  const { orgId } = await ctx.params;
  const secret = req.headers.get("x-fil-secret") ?? req.nextUrl.searchParams.get("k");
  if (!secret) return NextResponse.json({ error: "secret manquant" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const list = Array.isArray(json) ? json : [json];
  if (list.length > 100) return NextResponse.json({ error: "100 messages maximum par appel" }, { status: 413 });

  const supabase = createAnonClient();
  const results = [];
  for (const item of list) {
    const parsed = Message.safeParse(item);
    if (!parsed.success) {
      results.push({ status: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      continue;
    }
    const m = parsed.data;
    const { data, error } = await supabase.rpc("ingest_message", {
      p_org: orgId,
      p_secret: secret,
      p_channel: m.channel,
      p_direction: m.direction,
      p_from: m.from ?? null,
      p_to: m.to ?? null,
      p_subject: m.subject ?? null,
      p_body: m.body ?? null,
      p_occurred_at: m.occurred_at ?? new Date().toISOString(),
      p_external_id: m.external_id ?? null,
      p_from_name: m.from_name ?? null,
      p_duration_seconds: m.duration_seconds ?? null,
      p_provider: m.provider ?? null,
    });
    if (error) {
      const status = error.code === "28000" ? 401 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    results.push(data);
  }
  return NextResponse.json(Array.isArray(json) ? results : results[0]);
}
