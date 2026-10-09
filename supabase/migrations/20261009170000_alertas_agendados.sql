-- Fase 6: alertas automáticos diários (pg_cron).
-- Gera notificações dentro do sistema; cada alerta usa uma chave de deduplicação
-- para não repetir o mesmo aviso para a mesma pessoa.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.run_daily_alerts()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r record; u uuid;
  n_late int := 0; n_soon int := 0; n_occ int := 0; n_noresp int := 0; n_stale int := 0;
begin
  -- 1) Atividades atrasadas (prazo previsto passou e não concluída/cancelada): avisa uma vez por atividade.
  for r in
    select a.id, a.title, a.project_id, a.responsible_user_id, a.planned_end_date
    from public.activities a join public.projects p on p.id = a.project_id
    where p.archived_at is null and p.status not in ('concluida', 'cancelada')
      and a.status not in ('concluida', 'cancelada') and a.planned_end_date < v_today
  loop
    for u in select r.responsible_user_id where r.responsible_user_id is not null
             union select * from private.users_with_perm(r.project_id, 'atividade.gerenciar') loop
      perform private.notify(u, r.project_id, 'atividade_atrasada', 'Atividade atrasada: ' || r.title,
        'O prazo previsto era ' || to_char(r.planned_end_date, 'DD/MM/YYYY') || '.',
        '/obras/' || r.project_id || '?aba=atividades', 'activity', r.id, 'act-late-' || r.id || '-' || r.planned_end_date);
      n_late := n_late + 1;
    end loop;
  end loop;

  -- 2) Prazos próximos (atividades e ocorrências) dentro de due_soon_days: avisa o responsável.
  for r in
    select a.id, a.title, a.project_id, a.responsible_user_id as resp, a.planned_end_date as due, 'activity' as kind
    from public.activities a join public.projects p on p.id = a.project_id
    join public.org_settings s on s.organization_id = p.organization_id
    where p.archived_at is null and a.status not in ('concluida', 'cancelada') and a.responsible_user_id is not null
      and a.planned_end_date between v_today and v_today + s.due_soon_days
    union all
    select o.id, o.code || ' — ' || o.title, o.project_id, o.responsible_user_id, o.due_date, 'occurrence'
    from public.occurrences o join public.projects p on p.id = o.project_id
    join public.org_settings s on s.organization_id = p.organization_id
    where p.archived_at is null and o.status not in ('resolvida', 'encerrada') and o.responsible_user_id is not null
      and o.due_date between v_today and v_today + s.due_soon_days
  loop
    perform private.notify(r.resp, r.project_id, 'prazo_proximo', 'Prazo se aproximando: ' || r.title,
      'Vence em ' || to_char(r.due, 'DD/MM/YYYY') || '.',
      case when r.kind = 'activity' then '/obras/' || r.project_id || '?aba=atividades' else '/ocorrencias/' || r.id end,
      r.kind, r.id, 'due-soon-' || r.id || '-' || r.due);
    n_soon := n_soon + 1;
  end loop;

  -- 3) Ocorrências vencidas (prazo passou e não resolvidas).
  for r in
    select o.id, o.code, o.title, o.project_id, o.responsible_user_id, o.due_date
    from public.occurrences o join public.projects p on p.id = o.project_id
    where p.archived_at is null and o.status not in ('resolvida', 'encerrada') and o.due_date < v_today
  loop
    for u in select r.responsible_user_id where r.responsible_user_id is not null
             union select * from private.users_with_perm(r.project_id, 'ocorrencia.gerenciar') loop
      perform private.notify(u, r.project_id, 'ocorrencia_vencida', 'Ocorrência vencida: ' || r.code,
        r.title || ' — prazo era ' || to_char(r.due_date, 'DD/MM/YYYY') || '.',
        '/ocorrencias/' || r.id, 'occurrence', r.id, 'occ-late-' || r.id || '-' || r.due_date);
      n_occ := n_occ + 1;
    end loop;
  end loop;

  -- 4) Ocorrências abertas há mais de 1 dia sem responsável.
  for r in
    select o.id, o.code, o.title, o.project_id
    from public.occurrences o join public.projects p on p.id = o.project_id
    where p.archived_at is null and o.status not in ('resolvida', 'encerrada')
      and o.responsible_user_id is null and o.created_at < now() - interval '1 day'
  loop
    for u in select * from private.users_with_perm(r.project_id, 'ocorrencia.gerenciar') loop
      perform private.notify(u, r.project_id, 'ocorrencia_sem_responsavel', 'Ocorrência sem responsável: ' || r.code,
        r.title, '/ocorrencias/' || r.id, 'occurrence', r.id, 'occ-noresp-' || r.id);
      n_noresp := n_noresp + 1;
    end loop;
  end loop;

  -- 5) Obras em andamento sem diário há mais de stale_project_days dias úteis.
  for r in
    select p.id, p.name, p.code, last.d as last_date
    from public.projects p
    join public.org_settings s on s.organization_id = p.organization_id
    left join lateral (select max(dr.report_date) d from public.daily_reports dr where dr.project_id = p.id) last on true
    where p.archived_at is null and p.status = 'em_andamento' and coalesce(p.start_date, v_today) <= v_today
      and (select count(*) from generate_series(coalesce(last.d + 1, p.start_date, v_today), v_today - 1, interval '1 day') g
           where extract(isodow from g) < 6) >= s.stale_project_days
  loop
    for u in select * from private.users_with_perm(r.id, 'obra.editar')
             union select * from private.users_with_perm(r.id, 'diario.criar') loop
      perform private.notify(u, r.id, 'obra_sem_diario', 'Obra sem diário: ' || r.code,
        r.name || case when r.last_date is null then ' ainda não tem diário registrado.'
                      else ' — último diário em ' || to_char(r.last_date, 'DD/MM/YYYY') || '.' end,
        '/obras/' || r.id || '?aba=diario', 'project', r.id, 'stale-' || r.id || '-' || coalesce(r.last_date::text, 'nunca'));
      n_stale := n_stale + 1;
    end loop;
  end loop;

  return jsonb_build_object('atividades_atrasadas', n_late, 'prazos_proximos', n_soon, 'ocorrencias_vencidas', n_occ,
                            'ocorrencias_sem_responsavel', n_noresp, 'obras_sem_diario', n_stale, 'data', v_today);
end $$;

revoke all on function private.run_daily_alerts() from public, anon, authenticated;

-- Limpeza: notificações lidas com mais de 180 dias.
create or replace function private.cleanup_notifications()
returns void language sql security definer set search_path = '' as $$
  delete from public.notifications where read_at is not null and read_at < now() - interval '180 days';
$$;
revoke all on function private.cleanup_notifications() from public, anon, authenticated;

-- 07:05 em Brasília (10:05 UTC), todos os dias; limpeza aos domingos.
select cron.schedule('diario-alertas-diarios', '5 10 * * *', $$select private.run_daily_alerts()$$);
select cron.schedule('diario-limpeza-notificacoes', '20 10 * * 0', $$select private.cleanup_notifications()$$);
