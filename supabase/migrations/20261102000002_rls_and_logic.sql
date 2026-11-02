-- =====================================================================
-- RLS, fonctions métier, déclencheurs
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS générique : tables « métier » rattachées à une organisation
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','contacts','pipelines','stages','deals','activities','tasks',
    'ai_suggestions','products','quotes','quote_lines','invoice_lines','invoice_events',
    'inbox_items','import_jobs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_member(org_id)))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_member(org_id)))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_member(org_id))) with check ((select public.is_member(org_id)))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_member(org_id)))', t || '_delete', t);
  end loop;
end $$;

-- Factures : lecture par tous les membres, écriture par admin / finance / manager / commercial,
-- suppression des brouillons uniquement.
alter table public.invoices enable row level security;
create policy invoices_select on public.invoices for select to authenticated using ((select public.is_member(org_id)));
create policy invoices_insert on public.invoices for insert to authenticated with check ((select public.is_member(org_id)));
create policy invoices_update on public.invoices for update to authenticated using ((select public.is_member(org_id))) with check ((select public.is_member(org_id)));
create policy invoices_delete on public.invoices for delete to authenticated
  using (status = 'draft' and (select public.has_role(org_id, array['admin','finance']::public.member_role[])));

-- Organisations
alter table public.organizations enable row level security;
create policy organizations_select on public.organizations for select to authenticated using ((select public.is_member(id)));
create policy organizations_update on public.organizations for update to authenticated
  using ((select public.has_role(id, array['admin']::public.member_role[])))
  with check ((select public.has_role(id, array['admin']::public.member_role[])));

-- Profils : soi-même et collègues
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id)
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Membres
alter table public.memberships enable row level security;
create policy memberships_select on public.memberships for select to authenticated using ((select public.is_member(org_id)));
create policy memberships_update on public.memberships for update to authenticated
  using ((select public.has_role(org_id, array['admin']::public.member_role[])))
  with check ((select public.has_role(org_id, array['admin']::public.member_role[])));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((select public.has_role(org_id, array['admin']::public.member_role[])) or user_id = (select auth.uid()));

-- Invitations
alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using ((select public.has_role(org_id, array['admin','manager']::public.member_role[])));
create policy invitations_insert on public.invitations for insert to authenticated
  with check ((select public.has_role(org_id, array['admin','manager']::public.member_role[])));
create policy invitations_delete on public.invitations for delete to authenticated
  using ((select public.has_role(org_id, array['admin','manager']::public.member_role[])));

-- Règles d'automatisation et canaux : lecture membres, écriture admin / manager
do $$
declare t text;
begin
  foreach t in array array['automation_rules','channel_connections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_member(org_id)))', t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check ((select public.has_role(org_id, array['admin','manager']::public.member_role[])))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using ((select public.has_role(org_id, array['admin','manager']::public.member_role[]))) with check ((select public.has_role(org_id, array['admin','manager']::public.member_role[])))$p$, t || '_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using ((select public.has_role(org_id, array['admin','manager']::public.member_role[])))$p$, t || '_delete', t);
  end loop;
end $$;

-- Audit : lecture admin / manager, écriture uniquement par déclencheur
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated
  using ((select public.has_role(org_id, array['admin','manager']::public.member_role[])));

-- Compteurs : aucun accès direct
alter table public.document_counters enable row level security;

-- Le secret d'entrée des webhooks n'est lisible que par les administrateurs
-- (une révocation de colonne est sans effet face au droit de table : on ne redonne que les colonnes publiques)
revoke select on public.organizations from authenticated, anon;
grant select (id, name, country, default_currency, siren, vat_number, address, plan, trial_ends_at, created_at)
  on public.organizations to authenticated;

create or replace function public.get_inbound_secret(p_org uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role(p_org, array['admin']::public.member_role[]) then
    raise exception 'Réservé aux administrateurs';
  end if;
  return (select inbound_secret from public.organizations where id = p_org);
end $$;

-- ---------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_changes jsonb;
  v_old jsonb;
  v_new jsonb;
  v_org uuid;
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_org := old.org_id; v_id := old.id; v_changes := v_old;
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_org := new.org_id; v_id := new.id; v_changes := v_new;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_org := new.org_id; v_id := new.id;
    select jsonb_object_agg(k, jsonb_build_object('from', v_old->k, 'to', v_new->k))
      into v_changes
      from jsonb_object_keys(v_new) k
     where v_new->k is distinct from v_old->k and k not in ('updated_at', 'search_text', 'email_norm', 'phone_norm');
    if v_changes is null then return new; end if;
  end if;
  insert into public.audit_log(org_id, actor_id, action, entity, entity_id, changes)
  values (v_org, auth.uid(), lower(tg_op), tg_table_name, v_id, v_changes);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['contacts','companies','deals','quotes','invoices','ai_suggestions','automation_rules','channel_connections'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t || '_audit', t);
  end loop;
end $$;

create or replace function public.audit_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(org_id, actor_id, action, entity, entity_id, changes)
  values (coalesce(new.org_id, old.org_id), auth.uid(), lower(tg_op), 'memberships', coalesce(new.user_id, old.user_id),
          jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  return coalesce(new, old);
end $$;
create trigger memberships_audit after insert or update or delete on public.memberships
for each row execute function public.audit_membership();

-- ---------------------------------------------------------------------
-- Création d'organisation (onboarding) avec modèle de pipeline
-- ---------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text, p_country text default 'FR', p_currency text default 'EUR', p_template text default 'b2b_services'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_pipe uuid;
  v_stages text[][];
  i int;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;

  insert into public.organizations(name, country, default_currency)
  values (p_name, coalesce(p_country, 'FR'), coalesce(p_currency, 'EUR'))
  returning id into v_org;

  insert into public.memberships(org_id, user_id, role) values (v_org, auth.uid(), 'admin');

  v_stages := case p_template
    when 'distribution' then array[
      ['Demande entrante','10','open'], ['Qualification','25','open'], ['Offre tarifaire','50','open'],
      ['Négociation','75','open'], ['Commande','100','won'], ['Perdue','0','lost']]
    when 'simple' then array[
      ['À contacter','10','open'], ['En discussion','40','open'], ['Proposition','70','open'],
      ['Gagnée','100','won'], ['Perdue','0','lost']]
    else array[
      ['Nouveau lead','10','open'], ['Qualifié','25','open'], ['Rendez-vous','40','open'],
      ['Devis envoyé','60','open'], ['Négociation','80','open'], ['Gagnée','100','won'], ['Perdue','0','lost']]
  end;

  insert into public.pipelines(org_id, name, is_default) values (v_org, 'Ventes', true) returning id into v_pipe;
  for i in 1 .. array_length(v_stages, 1) loop
    insert into public.stages(org_id, pipeline_id, name, position, probability, kind)
    values (v_org, v_pipe, v_stages[i][1], i, v_stages[i][2]::int, v_stages[i][3]::public.stage_kind);
  end loop;

  -- Règle de relance par défaut : relancer 3 jours après l'envoi du devis
  insert into public.automation_rules(org_id, name, trigger, conditions, action, action_config)
  select v_org, 'Relance après envoi du devis', 'deal_stage_changed',
         jsonb_build_object('stage_id', s.id), 'create_task',
         jsonb_build_object('title', 'Relancer le client sur le devis', 'due_in_days', 3)
    from public.stages s where s.pipeline_id = v_pipe and s.name = 'Devis envoyé';

  -- Produit d'exemple pour démarrer un devis
  insert into public.products(org_id, name, unit_price, tax_rate, currency)
  values (v_org, 'Prestation (jour)', 650, 20, coalesce(p_currency, 'EUR'));

  return v_org;
end $$;

create or replace function public.create_pipeline(p_org uuid, p_name text, p_stages text[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_pipe uuid; i int; n int;
begin
  if not public.has_role(p_org, array['admin','manager']::public.member_role[]) then
    raise exception 'Réservé aux administrateurs';
  end if;
  insert into public.pipelines(org_id, name) values (p_org, p_name) returning id into v_pipe;
  n := coalesce(array_length(p_stages, 1), 0);
  for i in 1 .. n loop
    insert into public.stages(org_id, pipeline_id, name, position, probability, kind)
    values (p_org, v_pipe, p_stages[i], i, least(90, round(100.0 * i / (n + 1))::int), 'open');
  end loop;
  insert into public.stages(org_id, pipeline_id, name, position, probability, kind) values
    (p_org, v_pipe, 'Gagnée', n + 1, 100, 'won'),
    (p_org, v_pipe, 'Perdue', n + 2, 0, 'lost');
  return v_pipe;
end $$;

-- ---------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  select * into v_inv from public.invitations
   where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Invitation invalide ou expirée'; end if;
  if lower(v_inv.email) <> lower((select email from auth.users where id = auth.uid())) then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail';
  end if;
  insert into public.memberships(org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- ---------------------------------------------------------------------
-- Numérotation des documents (sans trou, par organisation et par année)
-- ---------------------------------------------------------------------
create or replace function public.next_document_number(p_org uuid, p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_year int := extract(year from now())::int; v_val int;
begin
  if not public.is_member(p_org) then raise exception 'Accès refusé'; end if;
  insert into public.document_counters(org_id, kind, year, value) values (p_org, p_kind, v_year, 1)
  on conflict (org_id, kind, year) do update set value = public.document_counters.value + 1
  returning value into v_val;
  return case p_kind when 'quote' then 'DEV' when 'invoice' then 'FAC' else upper(p_kind) end
         || '-' || v_year || '-' || lpad(v_val::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- Totaux des devis et factures
-- ---------------------------------------------------------------------
create or replace function public.recompute_document_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_doc uuid;
begin
  if tg_table_name = 'quote_lines' then
    v_doc := coalesce(new.quote_id, old.quote_id);
    update public.quotes q set
      subtotal = coalesce(s.sub, 0), tax_total = coalesce(s.tax, 0), total = coalesce(s.sub, 0) + coalesce(s.tax, 0)
    from (select round(sum(quantity * unit_price), 2) sub, round(sum(quantity * unit_price * tax_rate / 100), 2) tax
            from public.quote_lines where quote_id = v_doc) s
    where q.id = v_doc;
  else
    v_doc := coalesce(new.invoice_id, old.invoice_id);
    update public.invoices i set
      subtotal = coalesce(s.sub, 0), tax_total = coalesce(s.tax, 0), total = coalesce(s.sub, 0) + coalesce(s.tax, 0)
    from (select round(sum(quantity * unit_price), 2) sub, round(sum(quantity * unit_price * tax_rate / 100), 2) tax
            from public.invoice_lines where invoice_id = v_doc) s
    where i.id = v_doc;
  end if;
  return null;
end $$;
create trigger quote_lines_totals after insert or update or delete on public.quote_lines
for each row execute function public.recompute_document_totals();
create trigger invoice_lines_totals after insert or update or delete on public.invoice_lines
for each row execute function public.recompute_document_totals();

-- Une facture émise est immuable (seuls statut et suivi plateforme évoluent)
create or replace function public.lock_issued_invoice()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' then
    if new.number is distinct from old.number or new.customer is distinct from old.customer
       or new.currency is distinct from old.currency or new.issue_date is distinct from old.issue_date
       or (new.total is distinct from old.total and pg_trigger_depth() <= 1) then
      raise exception 'Une facture émise ne peut plus être modifiée. Émettez un avoir.';
    end if;
  end if;
  return new;
end $$;
create trigger invoices_lock before update on public.invoices for each row execute function public.lock_issued_invoice();

create or replace function public.lock_issued_invoice_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.invoices where id = coalesce(new.invoice_id, old.invoice_id) and status <> 'draft') then
    raise exception 'Les lignes d''une facture émise ne peuvent plus être modifiées.';
  end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_lock before insert or update or delete on public.invoice_lines
for each row execute function public.lock_issued_invoice_lines();

-- ---------------------------------------------------------------------
-- Moteur d'automatisation (AUTO-01, AUTO-02)
-- ---------------------------------------------------------------------
create or replace function public.run_automations(
  p_org uuid, p_trigger text, p_deal uuid default null, p_contact uuid default null, p_stage uuid default null
) returns int language plpgsql security definer set search_path = '' as $$
declare
  r public.automation_rules;
  v_count int := 0;
  v_owner uuid;
  v_users uuid[];
  v_pick uuid;
  v_pipeline uuid;
  v_contact uuid := p_contact;
begin
  if p_deal is not null then
    select pipeline_id, owner_id, coalesce(contact_id, p_contact) into v_pipeline, v_owner, v_contact
      from public.deals where id = p_deal;
  elsif p_contact is not null then
    select owner_id into v_owner from public.contacts where id = p_contact;
  end if;

  for r in select * from public.automation_rules
            where org_id = p_org and trigger = p_trigger and active
            order by created_at loop
    if (r.conditions ? 'stage_id' and (r.conditions->>'stage_id')::uuid is distinct from p_stage)
       or (r.conditions ? 'pipeline_id' and (r.conditions->>'pipeline_id')::uuid is distinct from v_pipeline) then
      continue;
    end if;

    if r.action = 'create_task' then
      insert into public.tasks(org_id, title, notes, due_at, assignee_id, contact_id, deal_id, source, rule_id)
      values (p_org,
              coalesce(r.action_config->>'title', 'Relance'),
              r.action_config->>'notes',
              now() + make_interval(days => coalesce((r.action_config->>'due_in_days')::int, 1)),
              v_owner, v_contact, p_deal, 'rule', r.id);
    elsif r.action = 'assign_owner' then
      select array_agg(value::uuid) into v_users from jsonb_array_elements_text(r.action_config->'user_ids');
      if v_users is not null and array_length(v_users, 1) > 0 then
        v_pick := v_users[(r.run_count % array_length(v_users, 1)) + 1];
        if p_deal is not null then
          update public.deals set owner_id = v_pick where id = p_deal and owner_id is null;
        end if;
        if p_contact is not null then
          update public.contacts set owner_id = v_pick where id = p_contact and owner_id is null;
        end if;
        v_owner := coalesce(v_owner, v_pick);
      end if;
    end if;

    update public.automation_rules set run_count = run_count + 1 where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.run_automations(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Opportunités : statut selon l'étape, activité de changement d'étape, règles
-- ---------------------------------------------------------------------
create or replace function public.deal_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind public.stage_kind; v_pipe uuid;
begin
  select kind, pipeline_id into v_kind, v_pipe from public.stages where id = new.stage_id;
  if v_pipe is distinct from new.pipeline_id then
    raise exception 'L''étape n''appartient pas au pipeline';
  end if;
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.status := v_kind::text::public.deal_status;
    new.closed_at := case when v_kind = 'open' then null else now() end;
  end if;
  return new;
end $$;
create trigger deals_before_write before insert or update of stage_id, pipeline_id on public.deals
for each row execute function public.deal_before_write();

create or replace function public.deal_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_from text; v_to text;
begin
  if tg_op = 'INSERT' then
    perform public.run_automations(new.org_id, 'deal_created', new.id, new.contact_id, new.stage_id);
  elsif new.stage_id is distinct from old.stage_id then
    select name into v_from from public.stages where id = old.stage_id;
    select name into v_to from public.stages where id = new.stage_id;
    insert into public.activities(org_id, type, direction, contact_id, company_id, deal_id, subject, source, created_by, meta)
    values (new.org_id, 'stage_change', 'internal', new.contact_id, new.company_id, new.id,
            new.title || ' : ' || coalesce(v_from, '?') || ' → ' || coalesce(v_to, '?'),
            'auto', auth.uid(), jsonb_build_object('from_stage', old.stage_id, 'to_stage', new.stage_id));
    perform public.run_automations(new.org_id, 'deal_stage_changed', new.id, new.contact_id, new.stage_id);
  end if;
  return null;
end $$;
create trigger deals_after_write after insert or update of stage_id on public.deals
for each row execute function public.deal_after_write();

create or replace function public.contact_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source <> 'import' then
    perform public.run_automations(new.org_id, 'contact_created', null, new.id, null);
  end if;
  return null;
end $$;
create trigger contacts_after_insert after insert on public.contacts
for each row execute function public.contact_after_insert();

-- Dernière activité sur le contact
create or replace function public.activity_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.contact_id is not null then
    update public.contacts set last_activity_at = greatest(coalesce(last_activity_at, new.occurred_at), new.occurred_at)
     where id = new.contact_id;
  end if;
  if new.direction = 'inbound' and new.type in ('email', 'whatsapp') then
    perform public.run_automations(new.org_id, 'inbound_message', new.deal_id, new.contact_id, null);
  end if;
  return null;
end $$;
create trigger activities_after_insert after insert on public.activities
for each row execute function public.activity_after_insert();

-- ---------------------------------------------------------------------
-- Doublons (CRM-03)
-- ---------------------------------------------------------------------
create or replace function public.find_contact_duplicates(
  p_org uuid, p_email text, p_phone text, p_exclude uuid default null
) returns setof public.contacts language sql stable security invoker set search_path = '' as $$
  select c.* from public.contacts c
   where c.org_id = p_org
     and (c.id is distinct from p_exclude)
     and ((public.normalize_email(p_email) is not null and c.email_norm = public.normalize_email(p_email))
       or (public.normalize_phone(p_phone) is not null and c.phone_norm = public.normalize_phone(p_phone)))
   limit 10;
$$;

-- Paires de doublons dans toute la base
create or replace function public.list_duplicate_pairs(p_org uuid)
returns table(a uuid, b uuid, reason text) language sql stable security invoker set search_path = '' as $$
  select x.id, y.id, case when x.email_norm = y.email_norm then 'email' else 'téléphone' end
    from public.contacts x join public.contacts y
      on x.org_id = y.org_id and x.id < y.id
     and ((x.email_norm is not null and x.email_norm = y.email_norm) or (x.phone_norm is not null and x.phone_norm = y.phone_norm))
   where x.org_id = p_org
   limit 200;
$$;

create or replace function public.merge_contacts(p_keep uuid, p_remove uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare k public.contacts; r public.contacts;
begin
  select * into k from public.contacts where id = p_keep;
  select * into r from public.contacts where id = p_remove;
  if k.id is null or r.id is null or k.org_id <> r.org_id then raise exception 'Contacts introuvables'; end if;

  update public.contacts set
    first_name = coalesce(k.first_name, r.first_name),
    last_name = coalesce(k.last_name, r.last_name),
    email = coalesce(k.email, r.email),
    phone = coalesce(k.phone, r.phone),
    job_title = coalesce(k.job_title, r.job_title),
    city = coalesce(k.city, r.city),
    company_id = coalesce(k.company_id, r.company_id),
    owner_id = coalesce(k.owner_id, r.owner_id),
    notes = nullif(concat_ws(E'\n', k.notes, r.notes), ''),
    custom = r.custom || k.custom,
    whatsapp_consent = k.whatsapp_consent or r.whatsapp_consent,
    whatsapp_consent_at = coalesce(k.whatsapp_consent_at, r.whatsapp_consent_at)
  where id = p_keep;

  update public.activities set contact_id = p_keep where contact_id = p_remove;
  update public.deals set contact_id = p_keep where contact_id = p_remove;
  update public.tasks set contact_id = p_keep where contact_id = p_remove;
  update public.quotes set contact_id = p_keep where contact_id = p_remove;
  update public.invoices set contact_id = p_keep where contact_id = p_remove;
  update public.ai_suggestions set contact_id = p_keep where contact_id = p_remove;
  delete from public.contacts where id = p_remove;

  insert into public.activities(org_id, type, contact_id, subject, source, created_by)
  values (k.org_id, 'system', p_keep, 'Fiche fusionnée avec un doublon', 'manual', auth.uid());
  return p_keep;
end $$;

-- ---------------------------------------------------------------------
-- Recherche globale (CRM-04) — index trigramme
-- ---------------------------------------------------------------------
create or replace function public.global_search(p_org uuid, p_q text, p_limit int default 8)
returns table(kind text, id uuid, title text, subtitle text) language sql stable security invoker set search_path = '' as $$
  with q as (select '%' || lower(trim(p_q)) || '%' as pat)
  (select 'contact', c.id, trim(concat_ws(' ', c.first_name, c.last_name)), concat_ws(' · ', c.email, c.phone)
     from public.contacts c, q where c.org_id = p_org and c.search_text like q.pat
     order by c.last_activity_at desc nulls last limit p_limit)
  union all
  (select 'company', co.id, co.name, concat_ws(' · ', co.city, co.domain)
     from public.companies co, q where co.org_id = p_org and co.search_text like q.pat
     order by co.updated_at desc limit p_limit)
  union all
  (select 'deal', d.id, d.title, d.amount::text || ' ' || d.currency
     from public.deals d, q where d.org_id = p_org and d.search_text like q.pat
     order by d.updated_at desc limit p_limit);
$$;

-- ---------------------------------------------------------------------
-- Devis → facture (FACT-01, FACT-02)
-- ---------------------------------------------------------------------
create or replace function public.customer_snapshot(p_company uuid, p_contact uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'company_name', co.name, 'address', co.address, 'city', co.city, 'country', co.country,
    'siren', co.siren, 'vat_number', co.vat_number,
    'contact_name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
    'email', coalesce(c.email, co.email), 'phone', coalesce(c.phone, co.phone)))
  from (select 1) x
  left join public.companies co on co.id = p_company
  left join public.contacts c on c.id = p_contact;
$$;

create or replace function public.create_quote_from_deal(p_deal uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare d public.deals; v_quote uuid;
begin
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'Opportunité introuvable'; end if;

  insert into public.quotes(org_id, number, deal_id, contact_id, company_id, currency, customer, created_by)
  values (d.org_id, public.next_document_number(d.org_id, 'quote'), d.id, d.contact_id, d.company_id, d.currency,
          public.customer_snapshot(d.company_id, d.contact_id), auth.uid())
  returning id into v_quote;

  if d.amount > 0 then
    insert into public.quote_lines(org_id, quote_id, description, quantity, unit_price, tax_rate, position)
    values (d.org_id, v_quote, d.title, 1, d.amount, 20, 1);
  end if;

  insert into public.activities(org_id, type, contact_id, company_id, deal_id, subject, source, created_by, meta)
  select d.org_id, 'quote', d.contact_id, d.company_id, d.id, 'Devis ' || number || ' créé', 'auto', auth.uid(),
         jsonb_build_object('quote_id', v_quote)
    from public.quotes where id = v_quote;
  return v_quote;
end $$;

create or replace function public.set_quote_status(p_quote uuid, p_status public.quote_status)
returns void language plpgsql security invoker set search_path = '' as $$
declare q public.quotes; v_won uuid;
begin
  select * into q from public.quotes where id = p_quote;
  if q.id is null then raise exception 'Devis introuvable'; end if;
  if q.status = 'invoiced' then raise exception 'Devis déjà facturé'; end if;

  update public.quotes set status = p_status,
    accepted_at = case when p_status = 'accepted' then now() else accepted_at end
  where id = p_quote;

  insert into public.activities(org_id, type, contact_id, company_id, deal_id, subject, source, created_by, meta)
  values (q.org_id, 'quote', q.contact_id, q.company_id, q.deal_id,
          'Devis ' || q.number || ' : ' || case p_status when 'sent' then 'envoyé' when 'accepted' then 'accepté'
            when 'refused' then 'refusé' else p_status::text end,
          'auto', auth.uid(), jsonb_build_object('quote_id', q.id));

  -- Parcours B : acceptation du devis → opportunité gagnée
  if p_status = 'accepted' and q.deal_id is not null then
    select s.id into v_won from public.stages s join public.deals d on d.pipeline_id = s.pipeline_id
     where d.id = q.deal_id and s.kind = 'won' order by s.position limit 1;
    if v_won is not null then
      update public.deals set stage_id = v_won, amount = q.subtotal where id = q.deal_id and status <> 'won';
    end if;
  end if;
end $$;

create or replace function public.convert_quote_to_invoice(p_quote uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare q public.quotes; v_inv uuid;
begin
  select * into q from public.quotes where id = p_quote;
  if q.id is null then raise exception 'Devis introuvable'; end if;
  if q.status <> 'accepted' then raise exception 'Seul un devis accepté peut être transformé en facture'; end if;

  insert into public.invoices(org_id, number, quote_id, deal_id, contact_id, company_id, currency, customer, notes, created_by)
  values (q.org_id, public.next_document_number(q.org_id, 'invoice'), q.id, q.deal_id, q.contact_id, q.company_id,
          q.currency, q.customer, q.notes, auth.uid())
  returning id into v_inv;

  insert into public.invoice_lines(org_id, invoice_id, product_id, description, quantity, unit_price, tax_rate, position)
  select org_id, v_inv, product_id, description, quantity, unit_price, tax_rate, position
    from public.quote_lines where quote_id = q.id;

  update public.quotes set status = 'invoiced' where id = q.id;

  insert into public.activities(org_id, type, contact_id, company_id, deal_id, subject, source, created_by, meta)
  select q.org_id, 'invoice', q.contact_id, q.company_id, q.deal_id, 'Facture ' || number || ' créée depuis le devis ' || q.number,
         'auto', auth.uid(), jsonb_build_object('invoice_id', v_inv, 'quote_id', q.id)
    from public.invoices where id = v_inv;
  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- Qualité des données et temps gagné (IA-04)
-- ---------------------------------------------------------------------
create or replace function public.data_quality(p_org uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with c as (
    select count(*) total,
           count(*) filter (where email_norm is not null) with_email,
           count(*) filter (where phone_norm is not null) with_phone,
           count(*) filter (where company_id is not null) with_company,
           count(*) filter (where owner_id is not null) with_owner
      from public.contacts where org_id = p_org
  ), d as (select count(*) n from public.list_duplicate_pairs(p_org)),
  a as (
    select count(*) total,
           count(*) filter (where source in ('auto','ai','rule')) automatic,
           count(*) filter (where source in ('auto','ai','rule') and type in ('email','whatsapp')) msgs,
           count(*) filter (where source in ('auto','ai','rule') and type in ('call','meeting')) calls_meetings,
           count(*) filter (where source in ('auto','ai','rule') and type not in ('email','whatsapp','call','meeting')) other_auto
      from public.activities where org_id = p_org and occurred_at > now() - interval '30 days'
  ), s as (
    select count(*) filter (where status = 'accepted') accepted,
           count(*) filter (where status = 'accepted' and not modified_before_accept) accepted_as_is,
           count(*) filter (where status in ('accepted','rejected','reverted')) decided
      from public.ai_suggestions where org_id = p_org
  )
  select jsonb_build_object(
    'contacts', c.total,
    'duplicates', d.n,
    'score', case when c.total = 0 then 0 else greatest(0, round(100.0 * (
        0.35 * c.with_email + 0.25 * c.with_phone + 0.25 * c.with_company + 0.15 * c.with_owner) / c.total
        - least(20, 100.0 * d.n / greatest(c.total, 1))))::int end,
    'completeness', jsonb_build_object('email', c.with_email, 'phone', c.with_phone, 'company', c.with_company, 'owner', c.with_owner),
    'activities_30d', a.total,
    'auto_captured_30d', a.automatic,
    'auto_capture_rate', case when a.total = 0 then 0 else round(100.0 * a.automatic / a.total)::int end,
    -- Hypothèses de temps de saisie évité : 2 min par message, 3 min par appel ou rendez-vous, 1 min sinon
    'minutes_saved_30d', a.msgs * 2 + a.calls_meetings * 3 + a.other_auto * 1 + s.accepted * 2,
    'ai_accepted', s.accepted,
    'ai_acceptance_as_is_rate', case when s.decided = 0 then null else round(100.0 * s.accepted_as_is / s.decided)::int end
  ) from c, d, a, s;
$$;

-- ---------------------------------------------------------------------
-- Permissions d'exécution des RPC
-- ---------------------------------------------------------------------
revoke execute on function public.create_organization(text, text, text, text) from public, anon;
revoke execute on function public.create_pipeline(uuid, text, text[]) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.next_document_number(uuid, text) from public, anon;
revoke execute on function public.get_inbound_secret(uuid) from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.audit_membership() from public, anon, authenticated;
revoke execute on function public.recompute_document_totals() from public, anon, authenticated;
revoke execute on function public.lock_issued_invoice_lines() from public, anon, authenticated;
revoke execute on function public.deal_before_write() from public, anon, authenticated;
revoke execute on function public.deal_after_write() from public, anon, authenticated;
revoke execute on function public.contact_after_insert() from public, anon, authenticated;
revoke execute on function public.activity_after_insert() from public, anon, authenticated;

-- Temps réel pour le Kanban partagé (PIP-01)
alter publication supabase_realtime add table public.deals;
