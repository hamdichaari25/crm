-- Import en masse (CRM-02 / CRM-03) : lot de lignes déjà mappées côté client.
-- p_mode : 'skip' (ignorer les doublons) ou 'merge' (compléter les champs vides de la fiche existante).
create or replace function public.import_contacts(p_org uuid, p_rows jsonb, p_mode text default 'skip', p_offset int default 0)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r record;
  v_row jsonb;
  v_email text; v_phone text; v_company text; v_company_id uuid;
  v_existing uuid;
  v_inserted int := 0; v_dups int := 0; v_updated int := 0; v_failed int := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if not public.is_member(p_org) then raise exception 'Accès refusé'; end if;

  for r in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_row := r.value;
    begin
      v_email := nullif(trim(v_row->>'email'), '');
      v_phone := nullif(trim(v_row->>'phone'), '');
      if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'E-mail invalide : %', v_email;
      end if;
      if coalesce(nullif(trim(v_row->>'first_name'), ''), nullif(trim(v_row->>'last_name'), ''), v_email, v_phone) is null then
        raise exception 'Ligne sans nom, e-mail ni téléphone';
      end if;

      v_company := nullif(trim(v_row->>'company'), '');
      v_company_id := null;
      if v_company is not null then
        select id into v_company_id from public.companies where org_id = p_org and lower(name) = lower(v_company) limit 1;
        if v_company_id is null then
          insert into public.companies(org_id, name, city, source) values (p_org, v_company, nullif(trim(v_row->>'city'), ''), 'import')
          returning id into v_company_id;
        end if;
      end if;

      select id into v_existing from public.contacts c
       where c.org_id = p_org
         and ((public.normalize_email(v_email) is not null and c.email_norm = public.normalize_email(v_email))
           or (public.normalize_phone(v_phone) is not null and c.phone_norm = public.normalize_phone(v_phone)))
       limit 1;

      if v_existing is not null then
        v_dups := v_dups + 1;
        if p_mode = 'merge' then
          update public.contacts set
            first_name = coalesce(first_name, nullif(trim(v_row->>'first_name'), '')),
            last_name = coalesce(last_name, nullif(trim(v_row->>'last_name'), '')),
            email = coalesce(email, v_email),
            phone = coalesce(phone, v_phone),
            job_title = coalesce(job_title, nullif(trim(v_row->>'job_title'), '')),
            city = coalesce(city, nullif(trim(v_row->>'city'), '')),
            company_id = coalesce(company_id, v_company_id)
          where id = v_existing;
          v_updated := v_updated + 1;
        end if;
        v_errors := v_errors || jsonb_build_object('row', p_offset + r.ordinality, 'level', 'duplicate',
                      'reason', 'Doublon d''une fiche existante' || case when p_mode = 'merge' then ' (complétée)' else ' (ignorée)' end);
        continue;
      end if;

      insert into public.contacts(org_id, company_id, first_name, last_name, email, phone, job_title, city, notes, source, custom)
      values (p_org, v_company_id, nullif(trim(v_row->>'first_name'), ''), nullif(trim(v_row->>'last_name'), ''), v_email, v_phone,
              nullif(trim(v_row->>'job_title'), ''), nullif(trim(v_row->>'city'), ''), nullif(trim(v_row->>'notes'), ''), 'import',
              coalesce(v_row->'custom', '{}'::jsonb));
      v_inserted := v_inserted + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('row', p_offset + r.ordinality, 'level', 'error', 'reason', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_dups, 'updated', v_updated, 'failed', v_failed, 'errors', v_errors);
end $$;
revoke execute on function public.import_contacts(uuid, jsonb, text, int) from public, anon;
