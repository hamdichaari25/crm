"use client";

import Papa from "papaparse";
import { useState, useTransition } from "react";
import { importChunk, saveImportJob, type ChunkResult, type ImportRow } from "@/app/(app)/_actions/import";
import { Badge, Button, Card, ErrorNote, Select, Table } from "@/components/ui";

const TARGETS = [
  { key: "", label: "— Ignorer —" },
  { key: "first_name", label: "Prénom" },
  { key: "last_name", label: "Nom" },
  { key: "full_name", label: "Nom complet (à découper)" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Téléphone" },
  { key: "company", label: "Entreprise" },
  { key: "job_title", label: "Fonction" },
  { key: "city", label: "Ville" },
  { key: "notes", label: "Notes" },
  { key: "custom", label: "Champ personnalisé" },
];

const GUESS: [RegExp, string][] = [
  [/^(pr[ée]nom|first.?name|given)/i, "first_name"],
  [/^(nom.?complet|full.?name|contact|name)$/i, "full_name"],
  [/^(nom|last.?name|surname|family)/i, "last_name"],
  [/mail|courriel/i, "email"],
  [/(t[ée]l|phone|mobile|portable|gsm|whatsapp)/i, "phone"],
  [/(soci[ée]t[ée]|entreprise|company|organisation|raison)/i, "company"],
  [/(fonction|poste|title|job|titre)/i, "job_title"],
  [/(ville|city|localit)/i, "city"],
  [/(note|commentaire|remarque)/i, "notes"],
];

const CHUNK = 500;

export function ImportWizard() {
  const [file, setFile] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [mode, setMode] = useState<"skip" | "merge">("skip");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChunkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f.name);
    let data: string[][] = [];
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(f);
        data = sheet.map((r) => r.map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
      } else {
        const text = await f.text();
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
        data = parsed.data;
      }
    } catch (e) {
      setError(`Lecture impossible : ${(e as Error).message}`);
      return;
    }
    if (data.length < 2) {
      setError("Le fichier doit contenir une ligne d'en-tête et au moins une ligne de données.");
      return;
    }
    const [head, ...body] = data;
    setHeaders(head.map((h) => String(h).trim()));
    setRows(body.filter((r) => r.some((c) => String(c).trim() !== "")));
    const m: Record<number, string> = {};
    head.forEach((h, i) => {
      const g = GUESS.find(([re]) => re.test(String(h).trim()));
      if (g && !Object.values(m).includes(g[1])) m[i] = g[1];
    });
    setMapping(m);
  }

  function toRow(r: string[]): ImportRow {
    const out: ImportRow = {};
    const custom: Record<string, string> = {};
    headers.forEach((h, i) => {
      const t = mapping[i];
      const v = String(r[i] ?? "").trim();
      if (!t || !v) return;
      if (t === "custom") custom[h] = v;
      else if (t === "full_name") {
        const parts = v.split(/\s+/);
        out.first_name = parts.shift() ?? "";
        out.last_name = parts.join(" ");
      } else out[t] = v;
    });
    if (Object.keys(custom).length) out.custom = custom;
    return out;
  }

  function run() {
    start(async () => {
      setError(null);
      const total: ChunkResult = { inserted: 0, duplicates: 0, updated: 0, failed: 0, errors: [] };
      try {
        for (let i = 0; i < rows.length; i += CHUNK) {
          // e.row = rang de la ligne de données (1 = première ligne après l'en-tête) ; ligne du fichier = e.row + 1
          const r = await importChunk(rows.slice(i, i + CHUNK).map(toRow), mode, i);
          total.inserted += r.inserted;
          total.duplicates += r.duplicates;
          total.updated += r.updated;
          total.failed += r.failed;
          total.errors.push(...r.errors);
          setProgress(Math.min(rows.length, i + CHUNK));
        }
        await saveImportJob(file, rows.length, total);
        setResult(total);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function downloadReport() {
    if (!result) return;
    const csv = Papa.unparse([["ligne du fichier", "type", "motif"], ...result.errors.map((e) => [String(e.row + 1), e.level === "error" ? "erreur" : "doublon", e.reason])]);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-import-${file.replace(/\.\w+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasIdentity = Object.values(mapping).some((v) => ["email", "phone", "first_name", "last_name", "full_name"].includes(v));

  return (
    <div className="space-y-6">
      <Card title="1. Choisir le fichier">
        <input
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-brand-ink"
        />
        <p className="mt-2 text-xs text-muted">CSV (séparateur détecté automatiquement) ou Excel .xlsx — jusqu&apos;à plusieurs dizaines de milliers de lignes.</p>
        <ErrorNote message={error} />
      </Card>

      {headers.length > 0 && !result && (
        <Card title={`2. Faire correspondre les colonnes — ${rows.length} lignes détectées`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {headers.map((h, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <p className="truncate text-sm font-medium">{h || `Colonne ${i + 1}`}</p>
                <p className="mb-2 truncate text-xs text-muted">ex. {rows[0]?.[i] || "—"}</p>
                <Select value={mapping[i] ?? ""} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })} aria-label={`Champ pour ${h}`}>
                  {TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Doublons (même e-mail ou téléphone) :
              <Select value={mode} onChange={(e) => setMode(e.target.value as "skip" | "merge")} className="w-auto">
                <option value="skip">ignorer la ligne</option>
                <option value="merge">compléter la fiche existante</option>
              </Select>
            </label>
            <Button onClick={run} disabled={pending || !hasIdentity}>
              {pending ? `Import… ${progress}/${rows.length}` : `Importer ${rows.length} lignes`}
            </Button>
            {!hasIdentity && <span className="text-xs text-warn">Associez au moins un nom, un e-mail ou un téléphone.</span>}
          </div>
        </Card>
      )}

      {result && (
        <Card title="3. Rapport d'import" action={result.errors.length > 0 && <Button variant="secondary" onClick={downloadReport}>Télécharger le rapport CSV</Button>}>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge tone="brand">{result.inserted} créés</Badge>
            <Badge tone="warn">{result.duplicates} doublons{result.updated ? ` (${result.updated} complétés)` : ""}</Badge>
            <Badge tone={result.failed ? "danger" : "neutral"}>{result.failed} erreurs</Badge>
          </div>
          {result.errors.length > 0 && (
            <Table head={["Ligne", "Type", "Motif"]}>
              {result.errors.slice(0, 50).map((e, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 tabular-nums">{e.row + 1}</td>
                  <td className="px-4 py-2">{e.level === "error" ? "Erreur" : "Doublon"}</td>
                  <td className="px-4 py-2 text-muted">{e.reason}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
