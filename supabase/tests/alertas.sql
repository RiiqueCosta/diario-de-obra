-- =====================================================================
-- Testes dos alertas automáticos (private.run_daily_alerts).
-- Requer tests.install_helpers() (de autorizacao.sql). Tudo é desfeito no final.
-- Executar: select tests.install_helpers(); select tests.run_alertas();
-- =====================================================================
create or replace function tests.run_alertas() returns void language plpgsql as $test$
declare
  u_adm uuid := 'c0000000-0000-4000-8000-000000000001';
  u_enc uuid := 'c0000000-0000-4000-8000-000000000002';
  u_out uuid := 'c0000000-0000-4000-8000-000000000003';
  org uuid; org2 uuid; prj uuid; a_late uuid; a_soon uuid; occ uuid;
  res jsonb; n1 int; n2 int;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform pg_temp.sys();
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, jsonb_build_object('name', x.n), now(), now(), now()
  from (values (u_adm, 'alerta.adm@exemplo.invalid', 'Adm'), (u_enc, 'alerta.enc@exemplo.invalid', 'Enc'),
               (u_out, 'alerta.out@exemplo.invalid', 'Outra empresa')) x(id, email, n);
  perform pg_temp.act(u_adm);  org := public.create_organization('Alertas (teste)');
  perform pg_temp.act(u_out);  org2 := public.create_organization('Outra (teste)');
  perform pg_temp.sys();
  insert into public.organization_members (organization_id, user_id, role, status) values (org, u_enc, 'membro', 'ativo');
  perform pg_temp.act(u_adm);
  insert into public.projects (organization_id, code, name, client_name, status, start_date)
  values (org, 'AL-1', 'Obra alertas', 'Cliente', 'em_andamento', today - 20) returning id into prj;
  insert into public.project_members (project_id, user_id, role) values (prj, u_enc, 'encarregado');
  insert into public.activities (project_id, title, planned_start_date, planned_end_date, responsible_user_id, status)
  values (prj, 'Atividade vencida', today - 10, today - 2, u_enc, 'em_andamento') returning id into a_late;
  insert into public.activities (project_id, title, planned_start_date, planned_end_date, responsible_user_id, status)
  values (prj, 'Atividade vence amanhã', today - 5, today + 1, u_enc, 'em_andamento') returning id into a_soon;
  insert into public.occurrences (project_id, title, description, category, priority, due_date, code)
  values (prj, 'Ocorrência sem dono', 'teste', 'Qualidade', 'media', today - 1, 'gerado') returning id into occ;
  perform pg_temp.sys();
  update public.occurrences set created_at = now() - interval '2 days' where id = occ;

  res := private.run_daily_alerts();
  perform pg_temp.ok((res->>'atividades_atrasadas')::int >= 2, 'atividade atrasada avisa responsável e gestores: ' || res::text);
  perform pg_temp.ok(exists (select 1 from public.notifications where user_id = u_enc and type = 'atividade_atrasada' and entity_id = a_late),
    'responsável recebe aviso de atividade atrasada');
  perform pg_temp.ok(exists (select 1 from public.notifications where user_id = u_enc and type = 'prazo_proximo' and entity_id = a_soon),
    'responsável recebe aviso de prazo próximo');
  perform pg_temp.ok(exists (select 1 from public.notifications where user_id = u_adm and type = 'ocorrencia_vencida' and entity_id = occ),
    'gestor recebe aviso de ocorrência vencida');
  perform pg_temp.ok(exists (select 1 from public.notifications where user_id = u_adm and type = 'ocorrencia_sem_responsavel' and entity_id = occ),
    'gestor recebe aviso de ocorrência sem responsável');
  perform pg_temp.ok(exists (select 1 from public.notifications where user_id = u_adm and type = 'obra_sem_diario' and entity_id = prj),
    'gestor recebe aviso de obra sem diário');
  perform pg_temp.ok(not exists (select 1 from public.notifications where user_id = u_out),
    'usuário de outra empresa não recebe alertas desta empresa');

  select count(*) into n1 from public.notifications where project_id = prj;
  perform private.run_daily_alerts();
  select count(*) into n2 from public.notifications where project_id = prj;
  perform pg_temp.ok(n1 = n2, 'rodar de novo no mesmo dia não duplica avisos');

  perform pg_temp.act(u_enc);
  perform pg_temp.ok((select count(*) from public.notifications where user_id <> u_enc) = 0, 'cada usuário só lê as próprias notificações');
  perform pg_temp.ok(not has_function_privilege('authenticated', 'private.run_daily_alerts()', 'execute'),
    'alertas não podem ser disparados pela API');

  perform pg_temp.sys();
  raise exception E'RESULTADO: % ok, % falhas\n%',
    coalesce(nullif(current_setting('t.pass', true), ''), '0'),
    coalesce(nullif(current_setting('t.fail', true), ''), '0'),
    current_setting('t.out', true);
end $test$;
revoke all on all functions in schema tests from public, anon, authenticated;

alter function tests.run_alertas() set search_path = public, pg_temp;
