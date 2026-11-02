-- =====================================================================
-- Ingestion des messages (e-mail, WhatsApp, appels) et des statuts de
-- la plateforme agréée, appelée par les webhooks avec le secret de l'organisation.
-- =====================================================================

create or replace function public.ingest_message(
  p_org uuid,
  p_secret text,
  p_channel text,                 -- email | whatsapp | call | meeting
  p_direction text,               -- inbound | outbound
  p_from text,
  p_to text,
  p_subject text,
  p_body text,
  p_occurred_at timestamptz default now(),
  p_external_id text default null,
  p_from_name text default null,
  p_duration_seconds int default null,
  p_provider text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_counterpart text;
  v_contact public.contacts;
  v_deal uuid;
  v_activity uuid;
  v_inbox uuid;
begin
  if not exists (select 1 from public.organizations where id = p_org and inbound_secret = p_secret) then
    raise exception 'Secret invalide' using errcode = '28000';
  end if;
  if p_channel not in ('email', 'whatsapp', 'call', 'meeting') then
    raise exception 'Canal inconnu : %', p_channel;
  end if;

  -- Déduplication par identifiant externe
  if p_external_id is not null then
    select id into v_activity from public.activities
     where org_id = p_org and channel_provider = coalesce(p_provider, p_channel) and external_id = p_external_id;
    if v_activity is not null then
      return jsonb_build_object('status', 'duplicate', 'activity_id', v_activity);
    end if;
  end if;

  v_counterpart := case when p_direction = 'outbound' then p_to else p_from end;

  select * into v_contact from public.contacts c
   where c.org_id = p_org
     and ((public.normalize_email(v_counterpart) is not null and c.email_norm = public.normalize_email(v_counterpart))
       or (public.normalize_phone(v_counterpart) is not null and c.phone_norm = public.normalize_phone(v_counterpart)))
   order by c.last_activity_at desc nulls last
   limit 1;

  if v_contact.id is null then
    if p_direction = 'outbound' then
      return jsonb_build_object('status', 'ignored', 'reason', 'destinataire inconnu');
    end if;
    insert into public.inbox_items(org_id, channel, from_address, from_name, subject, body, occurred_at, external_id)
    values (p_org, p_channel, p_from, p_from_name, p_subject, p_body, coalesce(p_occurred_at, now()), p_external_id)
    returning id into v_inbox;
    return jsonb_build_object('status', 'unmatched', 'inbox_item_id', v_inbox);
  end if;

  select id into v_deal from public.deals
   where org_id = p_org and contact_id = v_contact.id and status = 'open'
   order by updated_at desc limit 1;

  insert into public.activities(org_id, type, direction, contact_id, company_id, deal_id, subject, body,
                                from_address, to_address, duration_seconds, occurred_at, source, channel_provider, external_id)
  values (p_org, p_channel::public.activity_type, p_direction::public.activity_direction, v_contact.id, v_contact.company_id, v_deal,
          p_subject, p_body, p_from, p_to, p_duration_seconds, coalesce(p_occurred_at, now()), 'auto',
          coalesce(p_provider, p_channel), p_external_id)
  returning id into v_activity;

  return jsonb_build_object('status', 'linked', 'activity_id', v_activity, 'contact_id', v_contact.id, 'deal_id', v_deal);
end $$;
revoke execute on function public.ingest_message(uuid, text, text, text, text, text, text, text, timestamptz, text, text, int, text) from public;
grant execute on function public.ingest_message(uuid, text, text, text, text, text, text, text, timestamptz, text, text, int, text) to anon, authenticated;

-- Statut remonté par la plateforme agréée (FACT-03)
create or replace function public.ingest_invoice_status(
  p_org uuid, p_secret text, p_platform_ref text, p_status text, p_message text default null, p_raw jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_inv public.invoices; v_new public.invoice_status;
begin
  if not exists (select 1 from public.organizations where id = p_org and inbound_secret = p_secret) then
    raise exception 'Secret invalide' using errcode = '28000';
  end if;
  select * into v_inv from public.invoices where org_id = p_org and platform_ref = p_platform_ref;
  if v_inv.id is null then
    return jsonb_build_object('status', 'unknown_invoice');
  end if;

  v_new := case lower(p_status)
    when 'deposited' then 'transmitted' when 'transmitted' then 'transmitted'
    when 'received' then 'delivered' when 'delivered' then 'delivered' when 'approved' then 'delivered'
    when 'rejected' then 'rejected' when 'refused' then 'rejected'
    when 'paid' then 'paid' when 'collected' then 'paid'
    else v_inv.status end;

  update public.invoices set platform_status = p_status, status = v_new where id = v_inv.id;
  insert into public.invoice_events(org_id, invoice_id, status, message, raw)
  values (p_org, v_inv.id, p_status, p_message, p_raw);
  insert into public.activities(org_id, type, contact_id, company_id, deal_id, subject, body, source, channel_provider, meta)
  values (p_org, 'invoice', v_inv.contact_id, v_inv.company_id, v_inv.deal_id,
          'Facture ' || v_inv.number || ' : ' || p_status, p_message, 'auto', 'einvoice',
          jsonb_build_object('invoice_id', v_inv.id));
  return jsonb_build_object('status', 'updated', 'invoice_id', v_inv.id, 'invoice_status', v_new);
end $$;
revoke execute on function public.ingest_invoice_status(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.ingest_invoice_status(uuid, text, text, text, text, jsonb) to anon, authenticated;

-- Rattacher un message non identifié à un contact (existant ou créé)
create or replace function public.link_inbox_item(p_item uuid, p_contact uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare it public.inbox_items; c public.contacts; v_act uuid; v_deal uuid;
begin
  select * into it from public.inbox_items where id = p_item;
  select * into c from public.contacts where id = p_contact;
  if it.id is null or c.id is null or it.org_id <> c.org_id then raise exception 'Élément introuvable'; end if;
  select id into v_deal from public.deals where contact_id = c.id and status = 'open' order by updated_at desc limit 1;
  insert into public.activities(org_id, type, direction, contact_id, company_id, deal_id, subject, body, from_address,
                                occurred_at, source, channel_provider, external_id)
  values (it.org_id, it.channel::public.activity_type, 'inbound', c.id, c.company_id, v_deal, it.subject, it.body, it.from_address,
          it.occurred_at, 'auto', it.channel, it.external_id)
  returning id into v_act;
  update public.inbox_items set status = 'linked', resolved_activity_id = v_act where id = p_item;
  return v_act;
end $$;
