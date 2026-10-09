-- Históricos ordenados pelo instante real do evento (não pelo início da transação).
alter table public.daily_report_approvals alter column decided_at set default clock_timestamp();
alter table public.occurrence_history     alter column created_at set default clock_timestamp();
alter table public.occurrence_comments    alter column created_at set default clock_timestamp();
alter table public.audit_logs             alter column created_at set default clock_timestamp();
alter table public.notifications          alter column created_at set default clock_timestamp();
alter table public.daily_report_versions  alter column created_at set default clock_timestamp();

-- Reenvio após devolução volta a notificar os aprovadores.
create or replace function public.submit_daily_report(p_report uuid, p_row_version int default null)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports := private.lock_report(p_report, p_row_version);
  v_uid uuid := (select auth.uid());
  v_missing text[] := '{}';
  u uuid;
  v_project_name text;
begin
  if not private.can_edit_report(p_report) then
    raise exception 'Você não tem permissão para enviar este diário.' using errcode = '42501';
  end if;
  if r.weather is null then v_missing := array_append(v_missing, 'condição climática'); end if;
  if r.work_conditions is null then v_missing := array_append(v_missing, 'condição de trabalho'); end if;
  if coalesce(trim(r.general_summary), '') = '' then v_missing := array_append(v_missing, 'resumo geral do dia'); end if;
  if not exists (select 1 from public.daily_report_activities where daily_report_id = p_report)
     and coalesce(trim(r.no_execution_reason), '') = '' then
    v_missing := array_append(v_missing, 'serviços executados (ou motivo de não haver execução)');
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'Preencha antes de enviar: %.', array_to_string(v_missing, ', ') using errcode = '23514';
  end if;

  perform set_config('app.report_transition', 'on', true);
  update public.daily_reports set status = 'enviado', submitted_at = now() where id = p_report returning * into r;
  perform set_config('app.report_transition', 'off', true);

  insert into public.daily_report_approvals (daily_report_id, version, reviewer_user_id, decision)
  values (p_report, r.version, v_uid, 'enviado');

  select name into v_project_name from public.projects where id = r.project_id;
  for u in select * from private.users_with_perm(r.project_id, 'diario.aprovar') loop
    if u <> r.author_user_id then
      perform private.notify(u, r.project_id, 'diario_pendente',
        'Diário aguardando aprovação',
        v_project_name || ' — ' || to_char(r.report_date, 'DD/MM/YYYY'),
        '/diarios/' || r.id, 'daily_report', r.id, null);
    end if;
  end loop;
  return r;
end $$;
