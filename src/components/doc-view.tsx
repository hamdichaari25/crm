import { money } from "@/lib/format";

type Line = { id: string; description: string; quantity: number | string; unit_price: number | string; tax_rate: number | string };

export function CustomerBlock({ customer }: { customer: Record<string, string> }) {
  return (
    <div className="text-sm">
      <p className="font-medium">{customer.company_name ?? customer.contact_name ?? "Client"}</p>
      {customer.company_name && customer.contact_name && <p>À l&apos;attention de {customer.contact_name}</p>}
      {customer.address && <p>{customer.address}</p>}
      {(customer.city || customer.country) && <p>{[customer.city, customer.country].filter(Boolean).join(", ")}</p>}
      {customer.siren && <p className="text-muted">SIREN {customer.siren}</p>}
      {customer.vat_number && <p className="text-muted">TVA {customer.vat_number}</p>}
      {customer.email && <p className="text-muted">{customer.email}</p>}
    </div>
  );
}

export function LinesTable({ lines, currency, onDelete }: { lines: Line[]; currency: string; onDelete?: (id: string) => React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr><th className="py-2">Désignation</th><th className="py-2 text-right">Qté</th><th className="py-2 text-right">PU HT</th><th className="py-2 text-right">TVA</th><th className="py-2 text-right">Total HT</th>{onDelete && <th />}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.quantity)}</td>
              <td className="py-2 text-right tabular-nums">{money(l.unit_price, currency)}</td>
              <td className="py-2 text-right tabular-nums">{Number(l.tax_rate)} %</td>
              <td className="py-2 text-right tabular-nums">{money(Number(l.quantity) * Number(l.unit_price), currency)}</td>
              {onDelete && <td className="py-2 pl-2 text-right print:hidden">{onDelete(l.id)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({ subtotal, tax, total, currency }: { subtotal: number | string; tax: number | string; total: number | string; currency: string }) {
  return (
    <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
      <div className="flex justify-between"><dt className="text-muted">Total HT</dt><dd className="tabular-nums">{money(subtotal, currency)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted">TVA</dt><dd className="tabular-nums">{money(tax, currency)}</dd></div>
      <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total TTC</dt><dd className="tabular-nums">{money(total, currency)}</dd></div>
    </dl>
  );
}
