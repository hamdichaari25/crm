-- =====================================================================
-- CRM conversationnel — schéma principal (MVP)
-- Multi-organisation, isolation par RLS, journal d'audit.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.member_role as enum ('admin', 'manager', 'sales', 'finance');
create type public.stage_kind as enum ('open', 'won', 'lost');
create type public.deal_status as enum ('open', 'won', 'lost');
create type public.activity_type as enum ('email', 'whatsapp', 'call', 'meeting', 'note', 'stage_change', 'quote', 'invoice', 'system');
create type public.activity_direction as enum ('inbound', 'outbound', 'internal');
create type public.capture_source as enum ('manual', 'auto', 'ai', 'import', 'rule');
create type public.suggestion_kind as enum ('summary', 'field_update', 'create_deal', 'create_contact', 'next_action', 'draft');
create type public.suggestion_status as enum ('pending', 'accepted', 'rejected', 'reverted');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'refused', 'invoiced');
create type public.invoice_status as enum ('draft', 'issued', 'transmitted', 'delivered', 'rejected', 'paid', 'cancelled');

-- ---------------------------------------------------------------------
-- Organisations, profils, membres
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  country text not null default 'FR',
  default_currency text not null default 'EUR' check (default_currency in ('EUR','MAD','XOF','XAF','DZD','TND')),
  siren text,
  vat_number text,
  address text,
  plan text not null default 'trial' check (plan in ('trial','essentiel','pro')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  inbound_secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'sales',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships(user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'sales',
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days'
);
create index on public.invitations(org_id);

-- Fonctions d'appartenance (security definer pour éviter la récursion RLS)
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()));
$$;

create or replace function public.has_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any(p_roles));
$$;

-- Profil créé à l'inscription
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Utilitaires de normalisation (dédoublonnage)
-- ---------------------------------------------------------------------
create or replace function public.normalize_email(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(lower(trim(p)), '');
$$;

-- Garde les 9 derniers chiffres : rapproche +33 6 12 34 56 78 et 06 12 34 56 78
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = '' as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 8
    then right(regexp_replace(p, '\D', '', 'g'), 9) else null end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- Entreprises et contacts
-- ---------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  domain text,
  phone text,
  email text,
  address text,
  city text,
  country text,
  siren text,
  vat_number text,
  sector text,
  custom jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  source public.capture_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (lower(coalesce(name,'') || ' ' || coalesce(domain,'') || ' ' || coalesce(city,'') || ' ' || coalesce(email,''))) stored
);
create index on public.companies(org_id);
create index companies_search_trgm on public.companies using gin (search_text extensions.gin_trgm_ops);
create trigger companies_touch before update on public.companies for each row execute function public.touch_updated_at();

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  job_title text,
  city text,
  notes text,
  custom jsonb not null default '{}'::jsonb,
  owner_id uuid references auth.users(id) on delete set null,
  whatsapp_consent boolean not null default false,
  whatsapp_consent_at timestamptz,
  source public.capture_source not null default 'manual',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email_norm text generated always as (public.normalize_email(email)) stored,
  phone_norm text generated always as (public.normalize_phone(phone)) stored,
  search_text text generated always as (lower(coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(job_title,''))) stored,
  constraint contacts_has_identity check (coalesce(first_name, last_name, email, phone) is not null)
);
create index on public.contacts(org_id);
create index on public.contacts(company_id);
create index on public.contacts(org_id, email_norm);
create index on public.contacts(org_id, phone_norm);
create index contacts_search_trgm on public.contacts using gin (search_text extensions.gin_trgm_ops);
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Pipelines, étapes, opportunités
-- ---------------------------------------------------------------------
create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.pipelines(org_id);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  probability int not null default 10 check (probability between 0 and 100),
  kind public.stage_kind not null default 'open'
);
create index on public.stages(pipeline_id, position);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  title text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  probability int check (probability between 0 and 100),
  expected_close_date date,
  status public.deal_status not null default 'open',
  owner_id uuid references auth.users(id) on delete set null,
  source public.capture_source not null default 'manual',
  position double precision not null default 0,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_text text generated always as (lower(coalesce(title,''))) stored
);
create index on public.deals(org_id, pipeline_id, stage_id);
create index on public.deals(contact_id);
create index on public.deals(company_id);
create index deals_search_trgm on public.deals using gin (search_text extensions.gin_trgm_ops);
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Activités (fil unique), tâches
-- ---------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.activity_type not null,
  direction public.activity_direction not null default 'internal',
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  subject text,
  body text,
  from_address text,
  to_address text,
  duration_seconds int,
  occurred_at timestamptz not null default now(),
  source public.capture_source not null default 'manual',
  channel_provider text,
  external_id text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.activities(org_id, occurred_at desc);
create index on public.activities(contact_id, occurred_at desc);
create index on public.activities(company_id, occurred_at desc);
create index on public.activities(deal_id, occurred_at desc);
create unique index activities_external_uniq on public.activities(org_id, channel_provider, external_id) where external_id is not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  notes text,
  due_at timestamptz,
  done_at timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  source public.capture_source not null default 'manual',
  rule_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.tasks(org_id, done_at, due_at);
create index on public.tasks(assignee_id) where done_at is null;

-- ---------------------------------------------------------------------
-- Automatisations
-- ---------------------------------------------------------------------
create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger text not null check (trigger in ('deal_created', 'deal_stage_changed', 'contact_created', 'inbound_message')),
  conditions jsonb not null default '{}'::jsonb,   -- ex. {"stage_id": "..."} ou {"pipeline_id": "..."}
  action text not null check (action in ('create_task', 'assign_owner')),
  action_config jsonb not null default '{}'::jsonb, -- ex. {"title": "Relancer", "due_in_days": 3} ou {"strategy":"round_robin","user_ids":[...]}
  active boolean not null default true,
  run_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.automation_rules(org_id, trigger) where active;

-- ---------------------------------------------------------------------
-- IA : propositions validables et annulables
-- ---------------------------------------------------------------------
create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.suggestion_kind not null,
  target_type text not null check (target_type in ('contact', 'company', 'deal', 'activity')),
  target_id uuid,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  payload jsonb not null,                 -- contenu proposé
  previous_value jsonb,                   -- valeur avant application, pour l'annulation
  source_activity_ids uuid[] not null default '{}',  -- origine visible (citations)
  model text,
  status public.suggestion_status not null default 'pending',
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  modified_before_accept boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.ai_suggestions(org_id, status);
create index on public.ai_suggestions(contact_id);
create index on public.ai_suggestions(deal_id);

-- ---------------------------------------------------------------------
-- Produits, devis, factures
-- ---------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  currency text not null default 'EUR',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.products(org_id);

create table public.document_counters (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  year int not null,
  value int not null default 0,
  primary key (org_id, kind, year)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  status public.quote_status not null default 'draft',
  currency text not null default 'EUR',
  issue_date date not null default current_date,
  valid_until date not null default current_date + 30,
  customer jsonb not null default '{}'::jsonb,  -- instantané des données client
  notes text,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);
create index on public.quotes(deal_id);
create trigger quotes_touch before update on public.quotes for each row execute function public.touch_updated_at();

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  position int not null default 0
);
create index on public.quote_lines(quote_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  quote_id uuid references public.quotes(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  status public.invoice_status not null default 'draft',
  currency text not null default 'EUR',
  issue_date date not null default current_date,
  due_date date not null default current_date + 30,
  customer jsonb not null default '{}'::jsonb,
  notes text,
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  platform text,              -- plateforme agréée partenaire
  platform_ref text,          -- identifiant chez la plateforme
  platform_status text,       -- dernier statut remonté
  transmitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);
create index on public.invoices(quote_id);
create index on public.invoices(company_id);
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1,
  unit_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  position int not null default 0
);
create index on public.invoice_lines(invoice_id);

create table public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  status text not null,
  message text,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on public.invoice_events(invoice_id, created_at);

-- ---------------------------------------------------------------------
-- Canaux connectés, imports, messages non rattachés, audit
-- ---------------------------------------------------------------------
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'microsoft365', 'whatsapp', 'einvoice', 'telephony')),
  label text,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  config jsonb not null default '{}'::jsonb,   -- identifiants publics (phone_number_id, adresse…), jamais de secret
  connected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, provider)
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null,
  from_address text,
  from_name text,
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  external_id text,
  resolved_activity_id uuid references public.activities(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'ignored')),
  created_at timestamptz not null default now()
);
create index on public.inbox_items(org_id, status);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  filename text,
  total_rows int not null default 0,
  inserted int not null default 0,
  duplicates int not null default 0,
  failed int not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log(org_id, created_at desc);
