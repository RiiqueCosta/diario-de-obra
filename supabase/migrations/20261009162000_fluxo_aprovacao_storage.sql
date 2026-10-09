-- =====================================================================
-- Diário de Obra — Migração 3: fluxo de aprovação, notificações,
-- convites, painel e armazenamento privado de arquivos
-- =====================================================================

alter table public.profiles add column must_change_password boolean not null default false;

-- ---------------------------------------------------------------------
-- Variantes por usuário (para descobrir quem deve ser notificado)
-- ---------------------------------------------------------------------
create or replace function private.user_is_org_admin(p_user uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
                 where m.organization_id = p_org and m.user_id = p_user and m.role = 'admin'
                   and m.status = 'ativo' and p.status = 'ativo');
$$;

create or replace function private.user_has_perm(p_user uuid, p_project uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid := private.project_org(p_project);
  v_role public.project_role;
  v_over jsonb;
  v_val  jsonb;
begin
  if v_org is null or p_user is null then return false; end if;
  if private.user_is_org_admin(p_user, v_org) then return true; end if;
  select pm.role, pm.permissions into v_role, v_over
  from public.project_members pm
  join public.organization_members m on m.user_id = pm.user_id and m.organization_id = v_org and m.status = 'ativo'
  join public.profiles p on p.id = pm.user_id and p.status = 'ativo'
  where pm.project_id = p_project and pm.user_id = p_user;
  if v_role is null then return false; end if;
  if p_perm = 'diario.aprovar' and v_role = 'engenheiro' and not coalesce(
       (select engineer_can_approve from public.org_settings where organization_id = v_org), true) then
    return coalesce((v_over ->> p_perm)::boolean, false);
  end if;
  v_val := coalesce(v_over -> p_perm, private.default_permissions(v_role) -> p_perm);
  return coalesce((v_val #>> '{}')::boolean, false);
end $$;

-- has_perm passa a delegar para a versão por usuário (mesma regra em um só lugar).
create or replace function private.has_perm(p_project uuid, p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.user_has_perm((select auth.uid()), p_project, p_perm);
$$;

-- ---------------------------------------------------------------------
-- Notificações
-- ---------------------------------------------------------------------
create or replace function private.notify(
  p_user uuid, p_project uuid, p_type text, p_title text, p_message text,
  p_link text default null, p_entity_type text default null, p_entity_id uuid default null,
  p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (organization_id, user_id, project_id, type, title, message, link,
                                    entity_type, entity_id, dedupe_key)
  values (private.project_org(p_project), p_user, p_project, p_type, p_title, p_message, p_link,
          p_entity_type, p_entity_id, p_dedupe)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end $$;

-- Usuários com determinada permissão numa obra (admins + membros com a permissão).
create or replace function private.users_with_perm(p_project uuid, p_perm text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct u.id from (
    select m.user_id as id from public.organization_members m
    where m.organization_id = private.project_org(p_project) and m.status = 'ativo'
    union
    select pm.user_id from public.project_members pm where pm.project_id = p_project
  ) u
  where private.user_has_perm(u.id, p_project, p_perm);
$$;

-- Ocorrências de alta prioridade / atribuição de responsável geram aviso.
create or replace function private.notify_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_link text := '/ocorrencias/' || new.id; u uuid;
begin
  if new.priority in ('alta', 'critica') and (tg_op = 'INSERT' or old.priority not in ('alta', 'critica')) then
    for u in select * from private.users_with_perm(new.project_id, 'ocorrencia.gerenciar') loop
      if u <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid) then
        perform private.notify(u, new.project_id, 'ocorrencia_prioritaria',
          'Ocorrência ' || new.code || ' com prioridade ' || new.priority,
          new.title, v_link, 'occurrence', new.id, 'occ-prio-' || new.id);
      end if;
    end loop;
  end if;
  if new.responsible_user_id is not null
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id)
     and new.responsible_user_id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid) then
    perform private.notify(new.responsible_user_id, new.project_id, 'ocorrencia_atribuida',
      'Você é responsável pela ocorrência ' || new.code, new.title, v_link, 'occurrence', new.id, null);
  end if;
  return null;
end $$;
create trigger occurrences_notify after insert or update on public.occurrences
  for each row execute function private.notify_occurrence();

-- ---------------------------------------------------------------------
-- Fluxo de aprovação do diário
-- ---------------------------------------------------------------------
create or replace function private.report_snapshot(p_report uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(r) || jsonb_build_object(
    'author_name', (select name from public.profiles where id = r.author_user_id),
    'activities', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order, x.created_at) from public.daily_report_activities x where x.daily_report_id = r.id), '[]'::jsonb),
    'workers',    coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('worker_name', w.name)) from public.daily_report_workers x join public.workers w on w.id = x.worker_id where x.daily_report_id = r.id), '[]'::jsonb),
    'crews',      coalesce((select jsonb_agg(to_jsonb(x)) from public.daily_report_crews x where x.daily_report_id = r.id), '[]'::jsonb),
    'materials',  coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('material_name', m.name, 'unit', m.unit)) from public.daily_report_materials x join public.materials m on m.id = x.material_id where x.daily_report_id = r.id), '[]'::jsonb),
    'equipment',  coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('equipment_name', e.name, 'identification_code', e.identification_code)) from public.daily_report_equipment x join public.equipment e on e.id = x.equipment_id where x.daily_report_id = r.id), '[]'::jsonb),
    'photos',     coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'storage_key', a.storage_key, 'title', a.title, 'caption', a.caption, 'category', a.category)) from public.attachments a where a.daily_report_id = r.id and a.deleted_at is null), '[]'::jsonb),
    'occurrences',coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'code', o.code, 'title', o.title, 'status', o.status)) from public.occurrences o where o.daily_report_id = r.id), '[]'::jsonb))
  from public.daily_reports r where r.id = p_report;
$$;

create or replace function private.lock_report(p_report uuid, p_row_version int)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare r public.daily_reports;
begin
  select * into r from public.daily_reports where id = p_report for update;
  if not found or not private.can_view_report(p_report) then
    raise exception 'Diário não encontrado ou sem acesso.' using errcode = 'P0002';
  end if;
  if p_row_version is not null and r.row_version <> p_row_version then
    raise exception 'Este diário foi alterado por outra pessoa. Recarregue a página antes de continuar.' using errcode = '40001';
  end if;
  return r;
end $$;

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

create or replace function public.approve_daily_report(p_report uuid, p_comments text default null, p_row_version int default null)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports := private.lock_report(p_report, p_row_version);
  v_uid uuid := (select auth.uid());
begin
  if not private.has_perm(r.project_id, 'diario.aprovar') then
    raise exception 'Você não tem permissão para aprovar diários desta obra.' using errcode = '42501';
  end if;
  if r.author_user_id = v_uid then
    raise exception 'O autor não pode aprovar o próprio diário.' using errcode = '42501';
  end if;
  if r.status <> 'enviado' then
    raise exception 'Somente diários enviados para aprovação podem ser aprovados.' using errcode = '23514';
  end if;

  perform set_config('app.report_transition', 'on', true);
  update public.daily_reports
     set status = 'aprovado', approved_by = v_uid, approved_at = now(), returned_reason = null
   where id = p_report returning * into r;
  perform set_config('app.report_transition', 'off', true);

  insert into public.daily_report_approvals (daily_report_id, version, reviewer_user_id, decision, comments)
  values (p_report, r.version, v_uid, 'aprovado', nullif(trim(p_comments), ''));

  insert into public.daily_report_versions (daily_report_id, version, snapshot, reason, created_by)
  values (p_report, r.version, private.report_snapshot(p_report), 'Versão aprovada', v_uid)
  on conflict (daily_report_id, version) do update set snapshot = excluded.snapshot, reason = excluded.reason,
    created_by = excluded.created_by, created_at = now();

  perform private.notify(r.author_user_id, r.project_id, 'diario_aprovado', 'Diário aprovado',
    'Seu diário de ' || to_char(r.report_date, 'DD/MM/YYYY') || ' foi aprovado.',
    '/diarios/' || r.id, 'daily_report', r.id, null);
  update public.notifications set read_at = now()
   where entity_id = p_report and type = 'diario_pendente' and read_at is null;
  return r;
end $$;

create or replace function public.return_daily_report(p_report uuid, p_reason text, p_row_version int default null)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports := private.lock_report(p_report, p_row_version);
  v_uid uuid := (select auth.uid());
begin
  if not private.has_perm(r.project_id, 'diario.aprovar') then
    raise exception 'Você não tem permissão para revisar diários desta obra.' using errcode = '42501';
  end if;
  if r.author_user_id = v_uid then
    raise exception 'O autor não pode revisar o próprio diário.' using errcode = '42501';
  end if;
  if r.status <> 'enviado' then
    raise exception 'Somente diários enviados para aprovação podem ser devolvidos.' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Informe o motivo da devolução (mínimo de 5 caracteres).' using errcode = '23514';
  end if;

  perform set_config('app.report_transition', 'on', true);
  update public.daily_reports set status = 'devolvido', returned_reason = trim(p_reason)
   where id = p_report returning * into r;
  perform set_config('app.report_transition', 'off', true);

  insert into public.daily_report_approvals (daily_report_id, version, reviewer_user_id, decision, comments)
  values (p_report, r.version, v_uid, 'devolvido', trim(p_reason));

  perform private.notify(r.author_user_id, r.project_id, 'diario_devolvido', 'Diário devolvido para correção',
    to_char(r.report_date, 'DD/MM/YYYY') || ': ' || left(trim(p_reason), 200),
    '/diarios/' || r.id, 'daily_report', r.id, null);
  update public.notifications set read_at = now()
   where entity_id = p_report and type = 'diario_pendente' and read_at is null;
  return r;
end $$;

-- Correção pós-aprovação: guarda a versão aprovada, incrementa a versão e reabre.
create or replace function public.reopen_daily_report(p_report uuid, p_reason text, p_row_version int default null)
returns public.daily_reports language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports := private.lock_report(p_report, p_row_version);
  v_uid uuid := (select auth.uid());
begin
  if not private.has_perm(r.project_id, 'diario.corrigir') then
    raise exception 'Você não tem permissão para reabrir diários aprovados.' using errcode = '42501';
  end if;
  if r.status <> 'aprovado' then
    raise exception 'Somente diários aprovados podem ser reabertos para correção.' using errcode = '23514';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Informe a justificativa da correção (mínimo de 10 caracteres).' using errcode = '23514';
  end if;

  insert into public.daily_report_versions (daily_report_id, version, snapshot, reason, created_by)
  values (p_report, r.version, private.report_snapshot(p_report), 'Versão aprovada', r.approved_by)
  on conflict (daily_report_id, version) do nothing;

  perform set_config('app.report_transition', 'on', true);
  update public.daily_reports
     set status = 'devolvido', version = version + 1, approved_by = null, approved_at = null,
         submitted_at = null, returned_reason = 'Correção autorizada: ' || trim(p_reason)
   where id = p_report returning * into r;
  perform set_config('app.report_transition', 'off', true);

  insert into public.daily_report_approvals (daily_report_id, version, reviewer_user_id, decision, comments)
  values (p_report, r.version, v_uid, 'reaberto_para_correcao', trim(p_reason));

  if r.author_user_id <> v_uid then
    perform private.notify(r.author_user_id, r.project_id, 'diario_reaberto', 'Diário aprovado reaberto para correção',
      to_char(r.report_date, 'DD/MM/YYYY') || ': ' || left(trim(p_reason), 200),
      '/diarios/' || r.id, 'daily_report', r.id, null);
  end if;
  return r;
end $$;

revoke all on function public.submit_daily_report(uuid, int)         from public, anon;
revoke all on function public.approve_daily_report(uuid, text, int)  from public, anon;
revoke all on function public.return_daily_report(uuid, text, int)   from public, anon;
revoke all on function public.reopen_daily_report(uuid, text, int)   from public, anon;
grant execute on function public.submit_daily_report(uuid, int)        to authenticated;
grant execute on function public.approve_daily_report(uuid, text, int) to authenticated;
grant execute on function public.return_daily_report(uuid, text, int)  to authenticated;
grant execute on function public.reopen_daily_report(uuid, text, int)  to authenticated;

-- ---------------------------------------------------------------------
-- Convites: o usuário convidado ativa os próprios vínculos no 1º acesso.
-- ---------------------------------------------------------------------
create or replace function public.accept_pending_invites()
returns int language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.organization_members set status = 'ativo'
   where user_id = (select auth.uid()) and status = 'convidado';
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;

create or replace function public.mark_all_notifications_read()
returns int language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------
-- Painel: indicadores calculados com as permissões do próprio usuário
-- (SECURITY INVOKER: o RLS filtra tudo que ele não pode ver).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_org uuid, p_from date default null, p_to date default null,
  p_project uuid default null, p_responsible uuid default null, p_status public.project_status default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_due_days int := coalesce((select due_soon_days from public.org_settings where organization_id = p_org), 3);
  v jsonb;
begin
  with p as (
    select * from public.projects
    where organization_id = p_org and archived_at is null
      and (p_project is null or id = p_project)
      and (p_status is null or status = p_status)
      and (p_responsible is null or exists (select 1 from public.project_members pm where pm.project_id = projects.id and pm.user_id = p_responsible))
  ),
  r as (
    select dr.* from public.daily_reports dr join p on p.id = dr.project_id
    where (p_from is null or dr.report_date >= p_from) and (p_to is null or dr.report_date <= p_to)
  ),
  a as (select ac.* from public.activities ac join p on p.id = ac.project_id
        where (p_responsible is null or ac.responsible_user_id = p_responsible)),
  o as (select oc.* from public.occurrences oc join p on p.id = oc.project_id)
  select jsonb_build_object(
    'total_obras',            (select count(*) from p),
    'obras_em_andamento',     (select count(*) from p where status = 'em_andamento'),
    'obras_concluidas',       (select count(*) from p where status = 'concluida'),
    'obras_paralisadas',      (select count(*) from p where status = 'paralisada'),
    'obras_com_atraso',       (select count(distinct project_id) from a
                               where status not in ('concluida', 'cancelada') and planned_end_date < v_today),
    'diarios_hoje',           (select count(*) from public.daily_reports dr join p on p.id = dr.project_id where dr.report_date = v_today),
    'diarios_no_periodo',     (select count(*) from r),
    'diarios_pendentes',      (select count(*) from r where status = 'enviado'),
    'diarios_devolvidos',     (select count(*) from r where status = 'devolvido'),
    'ocorrencias_abertas',    (select count(*) from o where status not in ('resolvida', 'encerrada')),
    'ocorrencias_sem_responsavel', (select count(*) from o where status not in ('resolvida', 'encerrada') and responsible_user_id is null),
    'atividades_atrasadas',   (select count(*) from a where status not in ('concluida', 'cancelada') and planned_end_date < v_today),
    'atividades_bloqueadas',  (select count(*) from a where status = 'bloqueada'),
    'pendencias_vencendo',    (select count(*) from a where status not in ('concluida', 'cancelada')
                                 and planned_end_date between v_today and v_today + v_due_days)
                            + (select count(*) from o where status not in ('resolvida', 'encerrada')
                                 and due_date between v_today and v_today + v_due_days),
    'gerado_em',              now()
  ) into v;
  return v;
end $$;
revoke all on function public.dashboard_summary(uuid, date, date, uuid, uuid, public.project_status) from public, anon;
grant execute on function public.dashboard_summary(uuid, date, date, uuid, uuid, public.project_status) to authenticated;

-- =====================================================================
-- Storage privado
-- Caminhos: {org}/{obra}/{ano}/{uuid}.{ext}      fotos/anexos
--           {org}/{obra}/thumbs/{uuid}.webp      miniaturas
--           {org}/{obra}/docs/{uuid}.{ext}       documentos
--           {org}/{obra}/capa/{uuid}.{ext}       foto de capa
--           {org}/_empresa/{uuid}.{ext}          logotipo
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('obra-arquivos', 'obra-arquivos', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel',
  'application/acad', 'image/vnd.dwg', 'application/dwg', 'application/x-dwg',
  'text/plain', 'text/csv'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.safe_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

create or replace function private.storage_can_upload(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_org uuid := private.safe_uuid(v_parts[1]);
  v_project uuid;
begin
  if v_org is null or array_length(v_parts, 1) < 3 then return false; end if;
  if v_parts[2] = '_empresa' then
    return private.is_org_admin(v_org);
  end if;
  v_project := private.safe_uuid(v_parts[2]);
  if v_project is null or private.project_org(v_project) is distinct from v_org then return false; end if;
  if not private.project_is_open(v_project) then return false; end if;
  return private.has_perm(v_project, 'foto.enviar') or private.has_perm(v_project, 'documento.enviar')
      or private.has_perm(v_project, 'ocorrencia.criar') or private.has_perm(v_project, 'diario.criar')
      or private.has_perm(v_project, 'obra.editar');
end $$;

-- Leitura: o objeto precisa estar referenciado por um registro que o usuário pode ver
-- (as subconsultas respeitam o RLS das tabelas), ou ter sido enviado por ele e ainda não vinculado.
create or replace function private.storage_can_read(p_name text, p_owner uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.attachments a where (a.storage_key = p_name or a.thumbnail_key = p_name) and a.deleted_at is null)
      or exists (select 1 from public.project_documents d where d.storage_key = p_name and d.deleted_at is null)
      or exists (select 1 from public.projects p where p.cover_storage_key = p_name)
      or exists (select 1 from public.organizations o where o.logo_storage_key = p_name)
      or (p_owner = (select auth.uid()) and private.storage_can_upload(p_name));
$$;

-- Remoção física só para objeto próprio que nunca foi vinculado (limpeza de envio que falhou).
create or replace function private.storage_can_delete(p_name text, p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = (select auth.uid())
     and not exists (select 1 from public.attachments a where a.storage_key = p_name or a.thumbnail_key = p_name)
     and not exists (select 1 from public.project_documents d where d.storage_key = p_name)
     and not exists (select 1 from public.projects p where p.cover_storage_key = p_name)
     and not exists (select 1 from public.organizations o where o.logo_storage_key = p_name);
$$;

grant execute on all functions in schema private to authenticated, service_role;

create policy "obra-arquivos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'obra-arquivos' and private.storage_can_upload(name));
create policy "obra-arquivos: ler" on storage.objects for select to authenticated
  using (bucket_id = 'obra-arquivos' and private.storage_can_read(name, owner));
create policy "obra-arquivos: limpar envio não vinculado" on storage.objects for delete to authenticated
  using (bucket_id = 'obra-arquivos' and private.storage_can_delete(name, owner));
-- Sem política de UPDATE: arquivos originais nunca são sobrescritos.
