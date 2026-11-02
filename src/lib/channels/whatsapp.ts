import "server-only";

/**
 * WhatsApp Business via l'API officielle (Meta Cloud API).
 * Configuration : WHATSAPP_ACCESS_TOKEN (secret, variable d'environnement serveur)
 * + phone_number_id stocké dans channel_connections.config (identifiant non secret).
 */
const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfigured(config: { phone_number_id?: string } | null | undefined) {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && config?.phone_number_id);
}

export function toE164(phone: string, defaultCountry = "FR") {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("00")) return digits.slice(2);
  const prefix: Record<string, string> = { FR: "33", MA: "212", SN: "221", CI: "225", CM: "237", DZ: "213", TN: "216" };
  return (prefix[defaultCountry] ?? "33") + digits.replace(/^0/, "");
}

export async function sendWhatsAppText(opts: { phoneNumberId: string; to: string; text: string }) {
  const res = await fetch(`${GRAPH}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: opts.to, type: "text", text: { body: opts.text } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp : erreur ${res.status}`);
  return json?.messages?.[0]?.id as string | undefined;
}

export async function sendWhatsAppTemplate(opts: { phoneNumberId: string; to: string; template: string; language?: string }) {
  const res = await fetch(`${GRAPH}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: { name: opts.template, language: { code: opts.language ?? "fr" } },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp : erreur ${res.status}`);
  return json?.messages?.[0]?.id as string | undefined;
}

type MetaWebhook = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: { id: string; from: string; timestamp: string; type: string; text?: { body?: string }; button?: { text?: string } }[];
      };
    }[];
  }[];
};

/** Extrait les messages entrants d'une notification Meta. */
export function parseMetaWebhook(body: MetaWebhook) {
  const out: { id: string; from: string; name?: string; text: string; at: string }[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      const name = v?.contacts?.[0]?.profile?.name;
      for (const m of v?.messages ?? []) {
        out.push({
          id: m.id,
          from: "+" + m.from,
          name,
          text: m.text?.body ?? m.button?.text ?? `[${m.type}]`,
          at: new Date(Number(m.timestamp) * 1000).toISOString(),
        });
      }
    }
  }
  return out;
}
