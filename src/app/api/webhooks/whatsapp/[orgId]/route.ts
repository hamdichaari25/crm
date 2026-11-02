import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { parseMetaWebhook } from "@/lib/channels/whatsapp";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * Webhook Meta WhatsApp Cloud API.
 * URL de rappel : /api/webhooks/whatsapp/{orgId}?k={secret} ; jeton de vérification : {secret}.
 * Si WHATSAPP_APP_SECRET est défini, la signature X-Hub-Signature-256 est vérifiée.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") && p.get("hub.verify_token") === p.get("k")) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/webhooks/whatsapp/[orgId]">) {
  const { orgId } = await ctx.params;
  const secret = req.nextUrl.searchParams.get("k");
  if (!secret) return new NextResponse("Unauthorized", { status: 401 });
  const raw = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return new NextResponse("Bad signature", { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const supabase = createAnonClient();
  for (const m of parseMetaWebhook(body as Parameters<typeof parseMetaWebhook>[0])) {
    const { error } = await supabase.rpc("ingest_message", {
      p_org: orgId,
      p_secret: secret,
      p_channel: "whatsapp",
      p_direction: "inbound",
      p_from: m.from,
      p_to: null,
      p_subject: null,
      p_body: m.text,
      p_occurred_at: m.at,
      p_external_id: m.id,
      p_from_name: m.name ?? null,
      p_duration_seconds: null,
      p_provider: "whatsapp",
    });
    if (error?.code === "28000") return new NextResponse("Unauthorized", { status: 401 });
  }
  // Meta attend un 200 rapide, même pour les notifications de statut
  return NextResponse.json({ ok: true });
}
