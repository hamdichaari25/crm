"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Input } from "@/components/ui";

/** 2FA TOTP (application d'authentification). */
export function MfaSetup() {
  const supabase = createClient();
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp"));
  }
  useEffect(() => {
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => setFactors((data?.all ?? []).filter((f) => f.factor_type === "totp")));
  }, []);

  async function start() {
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Fil ${new Date().toLocaleDateString("fr-FR")}` });
    if (error) return setError(error.message);
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify() {
    if (!enroll) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    if (error) return setError("Code invalide.");
    setEnroll(null);
    setCode("");
    load();
  }
  async function remove(id: string) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) return setError(error.message);
    load();
  }

  const verified = factors.filter((f) => f.status === "verified");
  return (
    <div className="space-y-3 text-sm">
      {verified.length > 0 ? (
        <ul className="space-y-1">
          {verified.map((f) => (
            <li key={f.id} className="flex items-center justify-between">✓ {f.friendly_name ?? "Application"} <button className="text-xs text-danger" onClick={() => remove(f.id)}>Désactiver</button></li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">La double authentification n&apos;est pas activée.</p>
      )}
      {enroll ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qr} alt="QR code à scanner" className="h-40 w-40 rounded bg-white p-2" />
          <p className="text-xs text-muted">Ou saisissez la clé : <code>{enroll.secret}</code></p>
          <div className="flex gap-2"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code à 6 chiffres" inputMode="numeric" className="w-40" /><Button onClick={verify}>Vérifier</Button></div>
        </div>
      ) : (
        verified.length === 0 && <Button onClick={start}>Activer la double authentification</Button>
      )}
      <ErrorNote message={error} />
    </div>
  );
}
