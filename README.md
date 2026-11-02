# Fil — CRM conversationnel pour TPE/PME francophones

« Le CRM qui se remplit tout seul, pour les PME qui vendent par e-mail, téléphone et WhatsApp, et facturent en conformité. »

MVP construit d'après le PRD (novembre 2026). Stack : **Next.js 16** (App Router, Server Actions) · **Supabase** (Postgres + Auth + Realtime, région UE Francfort) · **Vercel** (région `fra1`) · **Claude** (Anthropic) pour l'IA.

## Démarrer

```bash
cp .env.example .env.local   # renseigner la clé publishable Supabase
npm install
npm run dev
```

Les migrations SQL sont dans `supabase/migrations/` (déjà appliquées sur le projet Supabase `crm`).

## Couverture du PRD

| Exigence | Statut | Où |
|---|---|---|
| CRM-01 fiches + champs personnalisés + historique | ✅ | `contacts/[id]`, `companies/[id]` |
| CRM-02 import CSV/Excel + correspondance + rapport | ✅ | `/import`, RPC `import_contacts` (lots de 500) |
| CRM-03 doublons à l'import et à la création, fusion | ✅ | `find_contact_duplicates`, `merge_contacts`, `/contacts/duplicates` |
| CRM-04 recherche globale | ✅ | index trigramme + RPC `global_search` (Ctrl K) |
| PIP-01 Kanban glisser-déposer, visible par l'équipe | ✅ | `/pipeline` + Supabase Realtime |
| PIP-02 plusieurs pipelines configurables | ✅ | `/settings/pipelines` |
| PIP-03 prévision pondérée | ✅ | pipeline + tableau de bord |
| CONV-01/02 Gmail, M365, calendrier | 🟡 | webhook générique `/api/inbound/{org}` ; OAuth natif à faire (validation Google/Microsoft) |
| CONV-03 WhatsApp Business API officielle | 🟡 | envoi depuis la fiche, consentement, webhook Meta ; modèles approuvés : envoi de modèle prêt côté code, UI à faire |
| CONV-04 fil unique | ✅ | `Timeline` |
| TEL-01 click-to-call + journalisation | ✅ | `tel:` + saisie d'appel avec durée ; webhook `channel: call` |
| AUTO-01 relances et tâches automatiques | ✅ | moteur `run_automations` (déclencheurs SQL) |
| AUTO-02 affectation des leads, actions au changement d'étape | ✅ | règle `assign_owner` (tour de rôle) |
| IA-01 résumé citant les messages | ✅ | `lib/ai/analyze.ts`, citations `[n]` cliquables |
| IA-02 propositions validables, annulables, origine visible | ✅ | `ai_suggestions` (+ `previous_value` pour annuler) |
| IA-03 prochaine action + brouillon, validation humaine | ✅ | aucun envoi automatique |
| IA-04 score qualité + temps gagné | ✅ | RPC `data_quality` |
| FACT-01 devis depuis l'opportunité | ✅ | RPC `create_quote_from_deal` (instantané client, taxes, devise) |
| FACT-02 devis → facture + export comptable | ✅ | `convert_quote_to_invoice`, `/api/accounting-export` |
| FACT-03 plateforme agréée partenaire | 🟡 | couche d'abstraction + connecteur « bac à sable » ; partenaire à choisir |
| REP-01 tableaux de bord filtrables | ✅ | `/dashboard` (personne, période) |
| MOB-01 mobile | 🟡 | PWA responsive, dictée vocale, notes hors ligne ; pas d'app native |
| ADM-01 rôles, invitations, export complet | ✅ | `/settings/team`, `/api/export` (ZIP de CSV) |

Non fonctionnel : RLS par organisation sur toutes les tables, 2FA TOTP, journal d'audit, factures émises immuables, numérotation continue, hébergement UE, devises EUR/MAD/XOF/XAF/DZD/TND.

## Intégrations entrantes

Toutes authentifiées par le secret d'organisation (visible par l'administrateur dans *Paramètres › Canaux*).

```bash
curl -X POST "$APP/api/inbound/$ORG" -H "x-fil-secret: $SECRET" -H "content-type: application/json" \
  -d '{"channel":"email","direction":"inbound","from":"client@exemple.fr","subject":"Devis","body":"…"}'
```

- `/api/webhooks/whatsapp/{org}?k={secret}` : webhook Meta (vérification `hub.challenge`, signature `X-Hub-Signature-256` si `WHATSAPP_APP_SECRET`).
- `/api/einvoice/{org}` : statut de la plateforme agréée `{ platform_ref, status, message }`.

## Règle IA

L'IA propose, l'utilisateur valide. Chaque proposition garde ses messages d'origine et sa valeur précédente. Sans `ANTHROPIC_API_KEY`, un moteur heuristique local (résumé extractif, détection de montants) est utilisé.
