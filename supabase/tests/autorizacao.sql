-- =====================================================================
-- Testes automatizados de autorização e integridade (Diário de Obra)
--
-- Simula requisições reais da API: troca o papel para "authenticated" e define
-- o JWT (request.jwt.claims) de cada usuário. Tudo roda em uma transação que é
-- desfeita no final (a exceção final carrega o relatório), então nenhum dado de
-- teste permanece no banco.
--
-- Instalar: executar este arquivo uma vez (cria o esquema "tests", sem acesso pela API).
-- Executar: select tests.run_autorizacao();  → ERRO "RESULTADO: X ok, Y falhas" + lista.
-- =====================================================================
create schema if not exists tests;
revoke all on schema tests from public, anon, authenticated;
create or replace function tests.install_helpers() returns void language plpgsql as $i$
begin
  execute $h$create or replace function pg_temp.act(p uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;$h$;
  execute $h$create or replace function pg_temp.sys() returns void language plpgsql as $f$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $f$;$h$;
  execute $h$create or replace function pg_temp.ok(cond boolean, name text) returns void language plpgsql as $f$
begin
  perform set_config('t.out', coalesce(current_setting('t.out', true), '')
    || case when coalesce(cond, false) then 'ok    ' else 'FALHA ' end || name || E'\n', false);
  perform set_config('t.' || case when coalesce(cond, false) then 'pass' else 'fail' end,
    (coalesce(nullif(current_setting('t.' || case when coalesce(cond, false) then 'pass' else 'fail' end, true), ''), '0')::int + 1)::text, false);
end $f$;$h$;
end $i$;

create or replace function tests.run_autorizacao() returns void language plpgsql as $test$
declare
  -- usuários
  u_admin_a uuid := 'a0000000-0000-4000-8000-000000000001';
  u_gestor  uuid := 'a0000000-0000-4000-8000-000000000002';
  u_eng     uuid := 'a0000000-0000-4000-8000-000000000003';
  u_enc     uuid := 'a0000000-0000-4000-8000-000000000004';
  u_colab   uuid := 'a0000000-0000-4000-8000-000000000005';
  u_fora    uuid := 'a0000000-0000-4000-8000-000000000006';
  u_admin_b uuid := 'b0000000-0000-4000-8000-000000000001';
  org_a uuid; org_b uuid;
  p_a1 uuid; p_a2 uuid; p_b1 uuid;
  r1 uuid; r2 uuid; rg uuid; occ uuid; act1 uuid; act2 uuid; st1 uuid;
  n int; v_text text; v_num numeric; v_rv int; failed boolean; rep public.daily_reports;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  -- ------------------------------------------------------------- fixture
  perform pg_temp.sys();
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email,
         jsonb_build_object('name', x.nome), now(), now(), now()
  from (values (u_admin_a, 'teste.admin.a@exemplo.invalid', 'Admin A'),
               (u_gestor,  'teste.gestor.a@exemplo.invalid', 'Gestor A'),
               (u_eng,     'teste.eng.a@exemplo.invalid', 'Engenheiro A'),
               (u_enc,     'teste.enc.a@exemplo.invalid', 'Encarregado A'),
               (u_colab,   'teste.colab.a@exemplo.invalid', 'Colaborador A'),
               (u_fora,    'teste.fora.a@exemplo.invalid', 'Sem obra A'),
               (u_admin_b, 'teste.admin.b@exemplo.invalid', 'Admin B')) as x(id, email, nome);
  perform pg_temp.ok((select count(*) from public.profiles where id in (u_admin_a, u_admin_b)) = 2,
    'perfil criado automaticamente ao criar usuário no Auth');

  perform pg_temp.act(u_admin_a);
  org_a := public.create_organization('Construtora A (teste)', '11.222.333/0001-81');
  perform pg_temp.act(u_admin_b);
  org_b := public.create_organization('Construtora B (teste)');
  perform pg_temp.sys();
  perform pg_temp.ok((select role from public.organization_members where organization_id = org_a and user_id = u_admin_a) = 'admin',
    'criador da empresa vira administrador');
  perform pg_temp.ok((select count(*) from public.units where organization_id = org_a) >= 10, 'unidades padrão criadas');

  -- convites (o que a Edge Function faz com a chave de serviço)
  insert into public.organization_members (organization_id, user_id, role, status)
  select org_a, u, 'membro', 'ativo' from unnest(array[u_gestor, u_eng, u_enc, u_colab, u_fora]) u;

  perform pg_temp.act(u_admin_a);
  insert into public.projects (organization_id, code, name, client_name, status, start_date)
  values (org_a, 'A-001', 'Residencial Alfa', 'Cliente Alfa', 'em_andamento', today - 30) returning id into p_a1;
  insert into public.projects (organization_id, code, name, client_name, status)
  values (org_a, 'A-002', 'Galpão Beta', 'Cliente Beta', 'planejamento') returning id into p_a2;
  insert into public.project_members (project_id, user_id, role) values
    (p_a1, u_gestor, 'gestor'), (p_a1, u_eng, 'engenheiro'), (p_a1, u_enc, 'encarregado'), (p_a1, u_colab, 'colaborador');
  perform pg_temp.ok(true, 'administrador cria obras e define a equipe');

  perform pg_temp.act(u_admin_b);
  insert into public.projects (organization_id, code, name, client_name) values (org_b, 'B-001', 'Obra B', 'Cliente B') returning id into p_b1;

  -- ------------------------------------------------- isolamento entre empresas
  perform pg_temp.act(u_admin_b);
  perform pg_temp.ok((select count(*) from public.projects where organization_id = org_a) = 0, 'empresa B não vê obras da empresa A');
  perform pg_temp.ok((select count(*) from public.organizations where id = org_a) = 0, 'empresa B não vê dados cadastrais da empresa A');
  perform pg_temp.ok((select count(*) from public.profiles where id = u_enc) = 0, 'empresa B não vê perfis de usuários da empresa A');
  update public.projects set name = 'invadido' where id = p_a1; get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'empresa B não altera obra da empresa A (adivinhando o id)');
  failed := false;
  begin
    insert into public.projects (organization_id, code, name, client_name) values (org_a, 'X-1', 'Intrusa', 'X');
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'empresa B não cria obra dentro da empresa A');
  failed := false;
  begin
    insert into public.project_members (project_id, user_id, role) values (p_a1, u_admin_b, 'gestor');
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'empresa B não se adiciona à equipe de obra da empresa A');
  failed := false;
  begin
    perform pg_temp.sys();
    insert into public.project_members (project_id, user_id, role) values (p_a1, u_admin_b, 'gestor');
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'banco impede vincular à obra usuário de outra empresa (mesmo com chave de serviço)');

  -- ------------------------------------------------------- acesso por obra
  perform pg_temp.act(u_enc);
  perform pg_temp.ok((select count(*) from public.projects where id = p_a1) = 1, 'encarregado vê a obra atribuída');
  perform pg_temp.ok((select count(*) from public.projects where id = p_a2) = 0, 'encarregado não vê obra não atribuída da mesma empresa');
  perform pg_temp.act(u_fora);
  perform pg_temp.ok((select count(*) from public.projects) = 0, 'membro sem obra atribuída não vê nenhuma obra');
  perform pg_temp.act(u_admin_a);
  perform pg_temp.ok((select count(*) from public.projects where organization_id = org_a) = 2, 'administrador vê todas as obras da empresa');

  perform pg_temp.act(u_gestor);
  update public.projects set description = 'Atualizado pelo gestor' where id = p_a1; get diagnostics n = row_count;
  perform pg_temp.ok(n = 1, 'gestor edita a obra atribuída');
  perform pg_temp.act(u_enc);
  update public.projects set description = 'x' where id = p_a1; get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'encarregado não edita dados da obra');
  perform pg_temp.act(u_gestor);
  failed := false;
  begin update public.projects set archived_at = now() where id = p_a1; exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'gestor não arquiva obra (somente administrador)');
  failed := false;
  begin
    insert into public.projects (organization_id, code, name, client_name) values (org_a, 'G-1', 'Obra do gestor', 'X');
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'gestor não cria obras novas');

  -- ------------------------------------------------- regras da obra (integridade)
  perform pg_temp.act(u_admin_a);
  failed := false;
  begin update public.projects set progress_percentage = 120, progress_method = 'manual' where id = p_a2; exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'percentual de avanço acima de 100% é rejeitado');
  update public.projects set actual_end_date = today where id = p_a2;
  perform pg_temp.ok((select actual_end_date from public.projects where id = p_a2) is null,
    'data real de conclusão só é aceita com a obra concluída');
  update public.projects set status = 'concluida', actual_end_date = today where id = p_a2;
  perform pg_temp.ok((select actual_end_date from public.projects where id = p_a2) = today, 'obra concluída aceita data real de conclusão');
  select row_version into v_rv from public.projects where id = p_a1;
  update public.projects set name = 'Residencial Alfa II' where id = p_a1 and row_version = v_rv; get diagnostics n = row_count;
  update public.projects set name = 'Sobrescrita silenciosa' where id = p_a1 and row_version = v_rv; get diagnostics v_rv = row_count;
  perform pg_temp.ok(n = 1 and v_rv = 0, 'controle de concorrência: segunda gravação com versão antiga não sobrescreve');

  update public.projects set archived_at = now() where id = p_a2;
  perform pg_temp.ok((select count(*) from public.projects where id = p_a2 and archived_by = u_admin_a) = 1, 'administrador arquiva obra; autor registrado');
  perform pg_temp.ok((select count(*) from public.projects where id = p_a2) = 1, 'obra arquivada continua consultável');

  -- ----------------------------------------------------- avanço ponderado
  perform pg_temp.act(u_eng);
  insert into public.project_stages (project_id, name, weight) values (p_a1, 'Estrutura', 1) returning id into st1;
  insert into public.activities (project_id, stage_id, title, weight, progress_percentage, status, planned_end_date)
    values (p_a1, st1, 'Fundação', 3, 100, 'concluida', today - 10) returning id into act1;
  insert into public.activities (project_id, stage_id, title, weight, progress_percentage, planned_end_date)
    values (p_a1, st1, 'Pilares', 1, 0, today - 2) returning id into act2;
  perform pg_temp.ok((select progress_percentage from public.projects where id = p_a1) = 75.00,
    'avanço da obra é ponderado por peso (3×100% + 1×0% = 75%), não média simples (50%)');
  perform pg_temp.ok((select actual_end_date from public.activities where id = act1) is not null, 'atividade concluída recebe data real de conclusão');
  failed := false;
  begin insert into public.activity_dependencies values (act1, act2, now()); insert into public.activity_dependencies values (act2, act1, now());
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'dependência circular no cronograma é rejeitada');
  perform pg_temp.act(u_enc);
  failed := false;
  begin insert into public.activities (project_id, title) values (p_a1, 'Atividade do encarregado'); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'encarregado não cadastra atividades no cronograma');

  -- ------------------------------------------------------------- diário
  perform pg_temp.act(u_enc);
  insert into public.daily_reports (project_id, report_date, author_user_id, status, approved_by)
  values (p_a1, today - 1, u_gestor, 'aprovado', u_eng) returning id into r1;
  select * into rep from public.daily_reports where id = r1;
  perform pg_temp.ok(rep.status = 'rascunho' and rep.author_user_id = u_enc and rep.approved_by is null,
    'novo diário nasce como rascunho do próprio autor (status e autor enviados pelo navegador são ignorados)');
  perform pg_temp.ok(rep.report_date = today - 1 and (rep.created_at at time zone 'America/Sao_Paulo')::date = today,
    'data do diário (ontem) é independente da data de criação do registro (hoje)');
  failed := false;
  begin insert into public.daily_reports (project_id, report_date, author_user_id) values (p_a1, today - 1, u_enc);
  exception when unique_violation then failed := true; end;
  perform pg_temp.ok(failed, 'apenas um diário principal por obra e data');
  insert into public.daily_reports (project_id, report_date, author_user_id, kind) values (p_a1, today - 1, u_enc, 'complementar') returning id into r2;
  perform pg_temp.ok(r2 is not null, 'diário complementar na mesma data é permitido');
  failed := false;
  begin insert into public.daily_reports (project_id, report_date, author_user_id) values (p_a1, today + 1, u_enc);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'diário com data futura é rejeitado');
  failed := false;
  begin insert into public.daily_reports (project_id, report_date, author_user_id) values (p_a2, today, u_enc);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'encarregado não cria diário em obra não atribuída');

  perform pg_temp.act(u_colab);
  perform pg_temp.ok((select count(*) from public.daily_reports where id = r1) = 0, 'colaborador não vê diários de terceiros');
  failed := false;
  begin insert into public.daily_reports (project_id, report_date, author_user_id) values (p_a1, today - 3, u_colab);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'colaborador sem permissão não cria diário');
  perform pg_temp.act(u_admin_b);
  perform pg_temp.ok((select count(*) from public.daily_reports where id = r1) = 0, 'empresa B não vê diário da empresa A');
  failed := false;
  begin insert into public.daily_report_activities (daily_report_id, description) values (r1, 'injetado');
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'empresa B não insere itens em diário da empresa A');

  perform pg_temp.act(u_enc);
  failed := false;
  begin perform public.submit_daily_report(r1); exception when others then failed := true; v_text := sqlerrm; end;
  perform pg_temp.ok(failed and v_text like 'Preencha antes de enviar%', 'envio bloqueado com campos obrigatórios faltando (rascunho incompleto é permitido)'
    || case when v_text like 'Preencha antes de enviar%' then '' else ' — recebido: ' || coalesce(v_text, 'nenhum erro') end);
  update public.daily_reports set weather = 'ensolarado', work_conditions = 'praticavel', general_summary = 'Concretagem do bloco B' where id = r1;
  insert into public.daily_report_activities (daily_report_id, activity_id, description, quantity, unit, execution_status)
  values (r1, act2, 'Armação de pilares P1 a P6', 12.5, 'm³', 'em_andamento');
  failed := false;
  begin insert into public.daily_report_activities (daily_report_id, description, progress_percentage) values (r1, 'x', 150);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'percentual de serviço acima de 100% é rejeitado');
  select row_version into v_rv from public.daily_reports where id = r1;
  failed := false;
  begin perform public.submit_daily_report(r1, v_rv - 1); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'envio com versão desatualizada é recusado (sem sobrescrita silenciosa)');
  rep := public.submit_daily_report(r1, v_rv);
  perform pg_temp.ok(rep.status = 'enviado' and rep.submitted_at is not null, 'autor envia diário para aprovação');
  failed := false;
  begin update public.daily_reports set general_summary = 'alterado após envio' where id = r1; get diagnostics n = row_count;
        if n = 0 then raise exception 'sem linhas'; end if;
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'diário enviado não pode ser editado');

  perform pg_temp.act(u_eng);
  perform pg_temp.ok((select count(*) from public.notifications where user_id = u_eng and type = 'diario_pendente' and entity_id = r1) = 1,
    'aprovador recebe notificação de diário pendente');
  failed := false;
  begin perform public.return_daily_report(r1, 'ok'); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'devolução exige motivo');
  rep := public.return_daily_report(r1, 'Faltou informar a equipe terceirizada.');
  perform pg_temp.ok(rep.status = 'devolvido', 'engenheiro devolve diário para correção com motivo');

  perform pg_temp.act(u_enc);
  perform pg_temp.ok((select count(*) from public.notifications where user_id = u_enc and type = 'diario_devolvido') = 1,
    'autor é notificado da devolução');
  insert into public.daily_report_crews (daily_report_id, company_name, job_title, quantity) values (r1, 'Terceirizada X', 'Servente', 6);
  rep := public.submit_daily_report(r1);
  perform pg_temp.ok(rep.status = 'enviado', 'autor corrige e reenvia');

  perform pg_temp.act(u_gestor);
  insert into public.daily_reports (project_id, report_date, author_user_id) values (p_a1, today - 2, u_gestor) returning id into rg;
  update public.daily_reports set weather = 'nublado', work_conditions = 'praticavel', general_summary = 'Dia do gestor',
         no_execution_reason = 'Visita técnica apenas' where id = rg;
  perform public.submit_daily_report(rg);
  failed := false;
  begin perform public.approve_daily_report(rg); exception when others then failed := true; v_text := sqlerrm; end;
  perform pg_temp.ok(failed and v_text like '%próprio%', 'autor não aprova o próprio diário');

  perform pg_temp.act(u_enc);
  failed := false;
  begin perform public.approve_daily_report(r1); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'encarregado não tem permissão para aprovar');

  perform pg_temp.act(u_eng);
  rep := public.approve_daily_report(r1, 'Conferido em campo.');
  perform pg_temp.ok(rep.status = 'aprovado' and rep.approved_by = u_eng, 'engenheiro aprova diário');
  perform pg_temp.ok((select count(*) from public.daily_report_versions where daily_report_id = r1 and version = 1) = 1,
    'versão aprovada é guardada integralmente (snapshot)');
  perform pg_temp.ok((select (snapshot -> 'crews' -> 0 ->> 'quantity')::int from public.daily_report_versions where daily_report_id = r1) = 6,
    'snapshot inclui os itens do diário');
  perform pg_temp.ok((select string_agg(decision::text, ',' order by decided_at) from public.daily_report_approvals where daily_report_id = r1)
    = 'enviado,devolvido,enviado,aprovado', 'histórico completo de decisões registrado');

  perform pg_temp.act(u_enc);
  failed := false;
  begin update public.daily_reports set general_summary = 'alteração silenciosa' where id = r1; get diagnostics n = row_count;
        if n = 0 then raise exception 'sem linhas'; end if;
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'diário aprovado não pode ser alterado pelo autor');
  failed := false;
  begin insert into public.daily_report_activities (daily_report_id, description) values (r1, 'item extra'); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'não é possível incluir itens em diário aprovado');
  failed := false;
  begin delete from public.daily_reports where id = r1; get diagnostics n = row_count; if n = 0 then raise exception 'x'; end if;
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'diário enviado/aprovado não pode ser excluído');
  perform pg_temp.sys();
  failed := false;
  begin update public.daily_reports set general_summary = 'via chave de serviço' where id = r1;
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'bloqueio do diário aprovado vale até para acesso administrativo direto ao banco');

  perform pg_temp.act(u_eng);
  failed := false;
  begin perform public.reopen_daily_report(r1, 'Correção do volume de concreto'); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'engenheiro (sem permissão de correção) não reabre diário aprovado');
  perform pg_temp.act(u_gestor);
  failed := false;
  begin perform public.reopen_daily_report(r1, 'curto'); exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'correção pós-aprovação exige justificativa');
  rep := public.reopen_daily_report(r1, 'Volume de concreto informado incorretamente.');
  perform pg_temp.ok(rep.status = 'devolvido' and rep.version = 2 and rep.returned_reason like 'Correção autorizada:%',
    'gestor reabre para correção autorizada: nova versão, justificativa registrada');
  perform pg_temp.ok((select count(*) from public.daily_report_versions where daily_report_id = r1 and version = 1) = 1,
    'versão anterior aprovada permanece preservada após a reabertura');

  perform pg_temp.act(u_admin_b);
  perform pg_temp.ok((select count(*) from public.daily_report_approvals where daily_report_id = r1) = 0
                 and (select count(*) from public.daily_report_versions where daily_report_id = r1) = 0,
    'empresa B não vê histórico de aprovação nem versões da empresa A');

  -- --------------------------------------------------------- ocorrências
  perform pg_temp.act(u_enc);
  insert into public.occurrences (project_id, daily_report_id, category, title, description, priority, created_by)
  values (p_a1, r1, 'Falta de material', 'Falta de cimento', 'Entrega não chegou', 'alta', u_enc) returning id into occ;
  perform pg_temp.ok((select code from public.occurrences where id = occ) = 'OC-0001', 'ocorrência recebe código sequencial por obra');
  begin update public.occurrences set status = 'resolvida' where id = occ; exception when others then null; end;
  perform pg_temp.ok((select status from public.occurrences where id = occ) = 'aberta', 'quem abriu a ocorrência não a encerra sem permissão');
  perform pg_temp.act(u_gestor);
  perform pg_temp.ok((select count(*) from public.notifications where user_id = u_gestor and type = 'ocorrencia_prioritaria') = 1,
    'gestor é notificado de ocorrência de alta prioridade');
  update public.occurrences set responsible_user_id = u_eng, due_date = today + 2 where id = occ;
  perform pg_temp.act(u_eng);
  perform pg_temp.ok((select count(*) from public.notifications where user_id = u_eng and type = 'ocorrencia_atribuida') = 1,
    'responsável é notificado da atribuição');
  update public.occurrences set status = 'resolvida', resolution_description = 'Fornecedor entregou' where id = occ;
  perform pg_temp.ok((select resolved_at from public.occurrences where id = occ) is not null, 'data de resolução registrada');
  perform pg_temp.ok((select count(*) from public.occurrence_history where occurrence_id = occ) >= 3,
    'histórico registra criação, mudança de responsável e de status');
  perform pg_temp.act(u_admin_b);
  failed := false;
  begin insert into public.occurrences (project_id, category, title, description, created_by) values (p_a1, 'x', 'Intrusa', 'x', u_admin_b);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'empresa B não abre ocorrência em obra da empresa A');
  perform pg_temp.ok((select count(*) from public.occurrence_history where occurrence_id = occ) = 0, 'empresa B não vê histórico de ocorrência da empresa A');

  -- ----------------------------------------------------------- notificações
  perform pg_temp.act(u_eng);
  perform pg_temp.ok((select count(*) from public.notifications where user_id <> u_eng) = 0, 'usuário só vê as próprias notificações');
  failed := false;
  begin update public.notifications set title = 'alterado' where user_id = u_eng; exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'notificação só permite marcar como lida');
  perform public.mark_all_notifications_read();
  perform pg_temp.ok((select count(*) from public.notifications where user_id = u_eng and read_at is null) = 0, 'marcar todas como lidas');

  -- --------------------------------------------------- anexos e armazenamento
  perform pg_temp.act(u_enc);
  perform pg_temp.ok(private.storage_can_upload(org_a || '/' || p_a1 || '/2026/foto.jpg'), 'encarregado pode enviar arquivo para a obra atribuída');
  perform pg_temp.ok(not private.storage_can_upload(org_a || '/' || p_a2 || '/2026/foto.jpg'), 'encarregado não envia arquivo para obra não atribuída');
  perform pg_temp.ok(not private.storage_can_upload(org_b || '/' || p_a1 || '/2026/foto.jpg'), 'caminho com empresa trocada é recusado');
  perform pg_temp.ok(not private.storage_can_upload('../../etc/passwd'), 'caminho malformado é recusado');
  perform pg_temp.ok(not private.storage_can_upload(org_a || '/_empresa/logo.png'), 'somente administrador envia logotipo');
  failed := false;
  begin insert into public.attachments (project_id, uploaded_by, file_name, storage_key, mime_type, file_size)
        values (p_a1, u_enc, 'f.jpg', org_b || '/' || p_a1 || '/f.jpg', 'image/jpeg', 100);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'registro de foto com caminho de outra empresa é recusado');
  failed := false;
  begin insert into public.attachments (project_id, daily_report_id, uploaded_by, file_name, storage_key, mime_type, file_size)
        values (p_a1, rg, u_enc, 'f.jpg', org_a || '/' || p_a1 || '/2026/x.jpg', 'image/jpeg', 100);
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'não é possível anexar foto a diário de outro autor já enviado');
  perform pg_temp.act(u_admin_b);
  perform pg_temp.ok(not private.storage_can_upload(org_a || '/' || p_a1 || '/2026/foto.jpg'), 'empresa B não envia arquivos para obra da empresa A');

  -- ------------------------------------------------------------- auditoria
  perform pg_temp.act(u_admin_a);
  perform pg_temp.ok((select count(*) from public.audit_logs where organization_id = org_a and entity_type = 'daily_reports') > 0,
    'auditoria registra operações do diário');
  perform pg_temp.ok((select count(*) from public.audit_logs where entity_type = 'projects' and action = 'archive' and user_id = u_admin_a) = 1,
    'auditoria registra arquivamento com autor');
  perform pg_temp.act(u_gestor);
  perform pg_temp.ok((select count(*) from public.audit_logs) = 0, 'auditoria visível somente para administradores');
  perform pg_temp.act(u_admin_b);
  perform pg_temp.ok((select count(*) from public.audit_logs where organization_id = org_a) = 0, 'empresa B não vê auditoria da empresa A');

  -- ------------------------------------------------------- usuários/perfis
  perform pg_temp.act(u_enc);
  failed := false;
  begin update public.profiles set status = 'ativo', email = 'outro@x.invalid' where id = u_enc; exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'usuário não altera o próprio e-mail/status');
  update public.organization_members set role = 'admin' where user_id = u_enc; get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'usuário comum não se promove a administrador');

  perform pg_temp.act(u_admin_a);
  failed := false;
  begin update public.organization_members set role = 'membro' where user_id = u_admin_a and organization_id = org_a;
  exception when others then failed := true; end;
  perform pg_temp.ok(failed, 'empresa não pode ficar sem administrador');
  update public.organization_members set status = 'inativo' where user_id = u_enc and organization_id = org_a;
  perform pg_temp.act(u_enc);
  perform pg_temp.ok((select count(*) from public.projects) = 0 and (select count(*) from public.daily_reports) = 0,
    'usuário desativado perde acesso imediatamente');
  perform pg_temp.act(u_admin_a);
  perform pg_temp.ok((select count(*) from public.daily_reports where author_user_id = u_enc) = 2,
    'registros do usuário desativado continuam preservados');

  -- ---------------------------------------------------------------- fim
  perform pg_temp.sys();
  raise exception E'RESULTADO: % ok, % falhas\n%',
    coalesce(nullif(current_setting('t.pass', true), ''), '0'),
    coalesce(nullif(current_setting('t.fail', true), ''), '0'),
    current_setting('t.out', true);
end $test$;
revoke all on all functions in schema tests from public, anon, authenticated;


alter function tests.install_helpers() set search_path = public, pg_temp;
alter function tests.run_autorizacao() set search_path = public, pg_temp;
