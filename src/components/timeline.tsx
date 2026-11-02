import Link from "next/link";
import { Badge } from "@/components/ui";
import { ACTIVITY_LABELS, dateTime } from "@/lib/format";

export type Activity = {
  id: string;
  type: string;
  direction: string;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  source: string;
  duration_seconds: number | null;
  from_address?: string | null;
  meta?: Record<string, unknown> | null;
  contact?: { id: string; first_name: string | null; last_name: string | null } | null;
};

const ICON: Record<string, string> = { email: "✉", whatsapp: "◍", call: "☎", meeting: "◷", note: "✎", stage_change: "→", quote: "❏", invoice: "€", system: "·" };

/** CONV-04 : fil unique, chronologique, tous canaux confondus. */
export function Timeline({ items, highlight, showContact }: { items: Activity[]; highlight?: Set<string>; showContact?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted">Aucun échange pour l&apos;instant. Les e-mails, messages WhatsApp et appels apparaîtront ici automatiquement.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((a) => {
        const inbound = a.direction === "inbound";
        return (
          <li key={a.id} id={`act-${a.id}`} className={`relative scroll-mt-24 rounded-lg ${highlight?.has(a.id) ? "bg-brand-soft p-2 -m-2" : ""}`}>
            <span className="absolute top-0.5 -left-[29px] grid h-5 w-5 place-items-center rounded-full border border-line bg-panel text-[11px]" aria-hidden>{ICON[a.type] ?? "·"}</span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-medium text-ink">{ACTIVITY_LABELS[a.type] ?? a.type}{a.type === "email" || a.type === "whatsapp" ? (inbound ? " reçu" : " envoyé") : ""}</span>
              <time dateTime={a.occurred_at}>{dateTime(a.occurred_at)}</time>
              {a.duration_seconds ? <span>{Math.round(a.duration_seconds / 60)} min</span> : null}
              {a.source !== "manual" && <Badge tone="brand">{a.source === "ai" ? "IA" : a.source === "rule" ? "Règle" : a.source === "import" ? "Import" : "Auto"}</Badge>}
              {a.meta?.simulated ? <Badge tone="warn">non envoyé (canal non connecté)</Badge> : null}
              {showContact && a.contact && <Link className="text-brand" href={`/contacts/${a.contact.id}`}>{[a.contact.first_name, a.contact.last_name].join(" ")}</Link>}
            </div>
            {a.subject && <p className="mt-0.5 text-sm font-medium">{a.subject}</p>}
            {a.body && (
              <p className={`mt-1 whitespace-pre-line text-sm ${inbound ? "rounded-lg bg-bg p-2" : ""}`}>{a.body.length > 1200 ? a.body.slice(0, 1200) + "…" : a.body}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
