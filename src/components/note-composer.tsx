"use client";

import { useRef, useState, useTransition } from "react";
import { logActivity } from "@/app/(app)/_actions/contacts";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { queueOfflineNote } from "@/components/offline-sync";

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void };

/** Saisie rapide : note (dictée vocale), appel ou rendez-vous. Fonctionne hors ligne pour les notes. */
export function NoteComposer({ contactId }: { contactId: string }) {
  const [type, setType] = useState("note");
  const [msg, setMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [pending, start] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<SpeechRec | null>(null);

  function dictate() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setMsg("La dictée vocale n'est pas disponible sur ce navigateur.");
      return;
    }
    if (listening) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = "fr-FR";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (body.current) body.current.value = `${body.current.value} ${last[0].transcript}`.trim();
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  function submit(fd: FormData) {
    setMsg(null);
    if (!navigator.onLine && type === "note") {
      queueOfflineNote(contactId, String(fd.get("body") ?? ""));
      setMsg("Hors ligne : note enregistrée, elle sera synchronisée au retour de la connexion.");
      if (body.current) body.current.value = "";
      return;
    }
    start(async () => {
      try {
        await logActivity(contactId, fd);
        if (body.current) body.current.value = "";
      } catch (e) {
        setMsg((e as Error).message);
      }
    });
  }

  return (
    <form action={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-auto" aria-label="Type d'activité">
          <option value="note">Note</option>
          <option value="call">Appel</option>
          <option value="meeting">Rendez-vous</option>
        </Select>
        {type !== "note" && <Input name="subject" placeholder={type === "call" ? "Objet de l'appel" : "Objet du rendez-vous"} className="flex-1" />}
        {type !== "note" && <Input name="duration_minutes" type="number" min={0} placeholder="Durée (min)" className="w-32" aria-label="Durée en minutes" />}
        {type === "meeting" && <Input name="occurred_at" type="datetime-local" className="w-auto" aria-label="Date" />}
      </div>
      <Textarea ref={body} name="body" rows={3} placeholder={type === "note" ? "Ajouter une note…" : "Compte rendu…"} required={type === "note"} />
      <div className="flex items-center gap-2">
        <Button disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</Button>
        <Button type="button" variant="secondary" onClick={dictate} aria-pressed={listening}>{listening ? "■ Arrêter la dictée" : "🎙 Dicter"}</Button>
        {msg && <span className="text-xs text-muted" role="status">{msg}</span>}
      </div>
    </form>
  );
}
