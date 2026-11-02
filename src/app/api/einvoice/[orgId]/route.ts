import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient } from "@/lib/supabase/server";

/** FACT-03 : statut remonté par la plateforme agréée partenaire. */
const Body = z.object({ platform_ref: z.string().min(1).max(200), status: z.string().min(1).max(50), message: z.string().max(2000).optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/einvoice/[orgId]">) {
  const { orgId } = await ctx.params;
  const secret = req.headers.get("x-fil-secret") ?? req.nextUrl.searchParams.get("k");
  if (!secret) return NextResponse.json({ error: "secret manquant" }, { status: 401 });
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("ingest_invoice_status", {
    p_org: orgId,
    p_secret: secret,
    p_platform_ref: parsed.data.platform_ref,
    p_status: parsed.data.status,
    p_message: parsed.data.message ?? null,
    p_raw: json,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "28000" ? 401 : 400 });
  return NextResponse.json(data);
}
