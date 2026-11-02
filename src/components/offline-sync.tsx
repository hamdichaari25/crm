"use client";

import { useEffect, useState } from "react";
import { logActivity } from "@/app/(app)/_actions/contacts";

const KEY = "fil.offline-notes";
type Pending = { contactId: string; body: string; at: string };

function read(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(v: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

export function queueOfflineNote(contactId: string, body: string) {
  write([...read(), { contactId, body, at: new Date().toISOString() }]);
  window.dispatchEvent(new Event("fil-offline-queue"));
}

/** Synchronise les notes prises hors ligne et enregistre le service worker (consultation hors ligne). */
export function OfflineSync() {
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const refresh = () => {
      setCount(read().length);
      setOnline(navigator.onLine);
    };
    const flush = async () => {
      refresh();
      if (!navigator.onLine) return;
      const queue = read();
      const rest: Pending[] = [];
      for (const n of queue) {
        const fd = new FormData();
        fd.set("type", "note");
        fd.set("body", n.body);
        fd.set("occurred_at", n.at);
        try {
          await logActivity(n.contactId, fd);
        } catch {
          rest.push(n);
        }
      }
      write(rest);
      refresh();
    };
    flush();
    window.addEventListener("online", flush);
    window.addEventListener("offline", refresh);
    window.addEventListener("fil-offline-queue", refresh);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("fil-offline-queue", refresh);
    };
  }, []);

  if (online && count === 0) return null;
  return (
    <div role="status" className="fixed right-4 bottom-20 z-40 rounded-lg bg-ink px-3 py-2 text-xs text-bg shadow-lg md:bottom-4">
      {online ? `Synchronisation de ${count} note(s)…` : `Hors ligne${count ? ` · ${count} note(s) en attente` : ""}`}
    </div>
  );
}
