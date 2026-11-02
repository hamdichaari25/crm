"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-lg border border-line bg-panel px-3 py-2 text-sm print:hidden">Imprimer / PDF</button>;
}
