-- =====================================================================
-- Diário de Obra — Migração 1: núcleo multiempresa, permissões, auditoria
-- =====================================================================
-- Princípios:
--  * Toda tabela exposta tem RLS habilitado.
--  * Funções auxiliares de autorização ficam no schema "private" (não exposto
--    pela API) e são SECURITY DEFINER com search_path fixo.
--  * Nada é apagado fisicamente por operações comuns: arquivamento/status.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.org_role        as enum ('admin', 'membro');
create type public.member_status   as enum ('ativo', 'convidado', 'inativo');
create type public.project_role    as enum ('gestor', 'engenheiro', 'encarregado', 'colaborador');
create type public.project_status  as enum ('planejamento', 'nao_iniciada', 'em_andamento', 'paralisada', 'concluida', 'cancelada');
create type public.progress_method as enum ('peso_etapa', 'peso_atividade', 'manual');

-- ---------------------------------------------------------------------
-- Gatilhos utilitários
-- ---------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Controle otimista de concorrência: cada UPDATE incrementa row_version.
-- O cliente envia a versão que leu (.eq('row_version', v)); se outra pessoa
-- salvou antes, nenhuma linha é atualizada e a interface avisa o conflito.
create or replace function private.bump_row_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Empresas, perfis e membros
-- ---------------------------------------------------------------------
create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(trim(name)) between 2 and 200),
  document_number     text check (document_number is null or document_number ~ '^[0-9]{11}$|^[0-9]{14}$'),
  logo_storage_key    text,
  contact_information jsonb not null default '{}'::jsonb,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on column public.organizations.logo_storage_key is 'Chave no Storage privado (não é URL); URLs assinadas são geradas sob demanda.';

-- Perfil público do usuário (credenciais ficam em auth.users).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete restrict,
  name        text not null default '' check (length(name) <= 200),
  email       text not null,
  status      public.member_status not null default 'ativo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));

create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id         uuid not null references public.profiles(id) on delete restrict,
  role            public.org_role not null default 'membro',
  status          public.member_status not null default 'ativo',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id, status);

create table public.org_settings (
  organization_id           uuid primary key references public.organizations(id) on delete restrict,
  stale_project_days        int  not null default 3   check (stale_project_days between 1 and 60),
  due_soon_days             int  not null default 3   check (due_soon_days between 1 and 60),
  max_image_mb              int  not null default 15  check (max_image_mb between 1 and 50),
  max_document_mb           int  not null default 30  check (max_document_mb between 1 and 50),
  engineer_can_approve      boolean not null default true,
  allow_complementary_reports boolean not null default true,
  updated_at                timestamptz not null default now()
);

-- Categorias configuráveis (fotos, ocorrências, documentos, materiais...)
create table public.categories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind            text not null check (kind in ('foto', 'ocorrencia', 'documento', 'material', 'equipamento')),
  name            text not null check (length(trim(name)) between 1 and 100),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, kind, name)
);

create table public.units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code            text not null check (length(trim(code)) between 1 and 20),
  name            text not null check (length(trim(name)) between 1 and 100),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, code)
);

-- ---------------------------------------------------------------------
-- Obras
-- ---------------------------------------------------------------------
create table public.projects (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete restrict,
  code                   text not null check (length(trim(code)) between 1 and 50),
  name                   text not null check (length(trim(name)) between 2 and 200),
  client_name            text not null check (length(trim(client_name)) between 1 and 200),
  client_document        text check (client_document is null or client_document ~ '^[0-9]{11}$|^[0-9]{14}$'),
  address                text,
  city                   text,
  state                  char(2) check (state is null or state ~ '^[A-Z]{2}$'),
  description            text,
  technical_responsible  text,
  technical_registration text,  -- CREA/CAU do responsável técnico, quando informado
  start_date             date,
  expected_end_date      date,
  actual_end_date        date,
  status                 public.project_status not null default 'planejamento',
  progress_method        public.progress_method not null default 'peso_etapa',
  progress_percentage    numeric(5,2) not null default 0 check (progress_percentage between 0 and 100),
  cover_storage_key      text,
  general_notes          text,
  row_version            int not null default 1,
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  archived_at            timestamptz,
  archived_by            uuid references auth.users(id),
  unique (organization_id, code),
  constraint projects_actual_end_only_when_done check (actual_end_date is null or status = 'concluida'),
  constraint projects_dates_order check (expected_end_date is null or start_date is null or expected_end_date >= start_date),
  constraint projects_actual_after_start check (actual_end_date is null or start_date is null or actual_end_date >= start_date)
);
create index projects_org_status_idx on public.projects (organization_id, status) where archived_at is null;
create index projects_org_name_idx   on public.projects (organization_id, name);

-- Participação em obra: o mesmo usuário pode ter papéis diferentes em obras diferentes.
create table public.project_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete restrict,
  user_id     uuid not null references public.profiles(id) on delete restrict,
  role        public.project_role not null,
  permissions jsonb not null default '{}'::jsonb,  -- ajustes finos: {"diario.aprovar": false}
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, user_id),
  constraint project_members_permissions_object check (jsonb_typeof(permissions) = 'object')
);
create index project_members_user_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------
-- Auditoria (preenchida somente por gatilhos)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  user_id         uuid,
  project_id      uuid,
  entity_type     text not null,
  entity_id       uuid,
  action          text not null,
  previous_values jsonb,
  new_values      jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx      on public.audit_logs (entity_type, entity_id);
create index audit_logs_project_idx     on public.audit_logs (project_id, created_at desc);

-- =====================================================================
-- Funções de autorização (schema private)
-- =====================================================================
create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.status = 'ativo'
      and p.status = 'ativo'
  );
$$;

create or replace function private.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
      and m.status = 'ativo'
      and p.status = 'ativo'
  );
$$;

create or replace function private.project_org(p_project uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select organization_id from public.projects where id = p_project;
$$;

-- Usuários que compartilham alguma empresa ativa com o usuário atual.
create or replace function private.shares_org(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members a
    join public.organization_members b on b.organization_id = a.organization_id
    where a.user_id = (select auth.uid()) and a.status = 'ativo'
      and b.user_id = p_user
  );
$$;

-- Papel do usuário atual na obra (null se não participa ou está inativo na empresa).
create or replace function private.project_role(p_project uuid)
returns public.project_role language sql stable security definer set search_path = '' as $$
  select pm.role
  from public.project_members pm
  join public.projects pr on pr.id = pm.project_id
  where pm.project_id = p_project
    and pm.user_id = (select auth.uid())
    and private.is_org_member(pr.organization_id);
$$;

create or replace function private.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.is_org_admin(private.project_org(p_project)), false)
      or private.project_role(p_project) is not null;
$$;

-- Matriz padrão de permissões por papel na obra.
create or replace function private.default_permissions(p_role public.project_role)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_role
    when 'gestor' then jsonb_build_object(
      'obra.editar', true,  'equipe.gerenciar', true, 'diario.criar', true,
      'diario.aprovar', true, 'diario.corrigir', true, 'atividade.gerenciar', true,
      'ocorrencia.criar', true, 'ocorrencia.gerenciar', true, 'foto.enviar', true,
      'documento.enviar', true, 'relatorio.gerar', true, 'diario.ver_todos', true)
    when 'engenheiro' then jsonb_build_object(
      'obra.editar', false, 'equipe.gerenciar', false, 'diario.criar', true,
      'diario.aprovar', true, 'diario.corrigir', false, 'atividade.gerenciar', true,
      'ocorrencia.criar', true, 'ocorrencia.gerenciar', true, 'foto.enviar', true,
      'documento.enviar', true, 'relatorio.gerar', true, 'diario.ver_todos', true)
    when 'encarregado' then jsonb_build_object(
      'obra.editar', false, 'equipe.gerenciar', false, 'diario.criar', true,
      'diario.aprovar', false, 'diario.corrigir', false, 'atividade.gerenciar', false,
      'ocorrencia.criar', true, 'ocorrencia.gerenciar', false, 'foto.enviar', true,
      'documento.enviar', false, 'relatorio.gerar', false, 'diario.ver_todos', true)
    else jsonb_build_object(
      'obra.editar', false, 'equipe.gerenciar', false, 'diario.criar', false,
      'diario.aprovar', false, 'diario.corrigir', false, 'atividade.gerenciar', false,
      'ocorrencia.criar', false, 'ocorrencia.gerenciar', false, 'foto.enviar', false,
      'documento.enviar', false, 'relatorio.gerar', false, 'diario.ver_todos', false)
  end;
$$;

-- Verifica uma permissão do usuário atual na obra.
-- Administrador da empresa tem todas; demais: padrão do papel + ajustes da obra.
-- A configuração "engineer_can_approve" da empresa restringe engenheiros.
create or replace function private.has_perm(p_project uuid, p_perm text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid := private.project_org(p_project);
  v_role public.project_role;
  v_over jsonb;
  v_val  jsonb;
begin
  if v_org is null then return false; end if;
  if private.is_org_admin(v_org) then return true; end if;

  select pm.role, pm.permissions into v_role, v_over
  from public.project_members pm
  where pm.project_id = p_project and pm.user_id = (select auth.uid());

  if v_role is null or not private.is_org_member(v_org) then return false; end if;

  if p_perm = 'diario.aprovar' and v_role = 'engenheiro' and not coalesce(
       (select engineer_can_approve from public.org_settings where organization_id = v_org), true) then
    return coalesce((v_over ->> p_perm)::boolean, false);
  end if;

  v_val := coalesce(v_over -> p_perm, private.default_permissions(v_role) -> p_perm);
  return coalesce((v_val #>> '{}')::boolean, false);
end $$;

-- Permissões efetivas (para a interface exibir/ocultar ações; o banco revalida sempre).
create or replace function public.my_project_permissions(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_keys text[] := array['obra.editar','equipe.gerenciar','diario.criar','diario.aprovar',
    'diario.corrigir','atividade.gerenciar','ocorrencia.criar','ocorrencia.gerenciar',
    'foto.enviar','documento.enviar','relatorio.gerar','diario.ver_todos'];
  v_out jsonb := '{}'::jsonb;
  k text;
begin
  if not private.can_view_project(p_project) then return null; end if;
  foreach k in array v_keys loop
    v_out := v_out || jsonb_build_object(k, private.has_perm(p_project, k));
  end loop;
  return v_out || jsonb_build_object(
    'is_admin', private.is_org_admin(private.project_org(p_project)),
    'role', private.project_role(p_project));
end $$;

grant execute on all functions in schema private to authenticated, service_role;

-- =====================================================================
-- Auditoria genérica
-- =====================================================================
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_project uuid;
  v_action text := lower(tg_op);
begin
  -- não registrar atualizações que só mexeram em updated_at/row_version
  if tg_op = 'UPDATE' and (v_new - 'updated_at' - 'row_version') = (v_old - 'updated_at' - 'row_version') then
    return null;
  end if;

  v_project := case
    when tg_table_name = 'projects' then (v_row ->> 'id')::uuid
    else (v_row ->> 'project_id')::uuid end;
  v_org := coalesce(
    (v_row ->> 'organization_id')::uuid,
    case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end,
    (select organization_id from public.projects where id = v_project));

  if tg_op = 'UPDATE' and tg_table_name = 'projects'
     and (v_old ->> 'archived_at') is null and (v_new ->> 'archived_at') is not null then
    v_action := 'archive';
  end if;

  insert into public.audit_logs (organization_id, user_id, project_id, entity_type, entity_id,
                                 action, previous_values, new_values)
  values (v_org, (select auth.uid()), v_project, tg_table_name, (v_row ->> 'id')::uuid,
          v_action, v_old, v_new);
  return null;
end $$;

-- =====================================================================
-- Regras de integridade via gatilhos
-- =====================================================================

-- Perfil criado automaticamente quando um usuário é criado no Auth.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Usuário só pode alterar o próprio nome; status/e-mail são administrativos.
create or replace function private.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' then
    if new.status is distinct from old.status or new.email is distinct from old.email or new.id <> old.id then
      raise exception 'Somente administradores podem alterar status ou e-mail do usuário.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Membro de obra precisa ser membro ativo da mesma empresa.
create or replace function private.guard_project_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.projects where id = new.project_id;
  if not exists (select 1 from public.organization_members
                 where organization_id = v_org and user_id = new.user_id and status in ('ativo','convidado')) then
    raise exception 'O usuário não pertence à empresa desta obra.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.user_id <> old.user_id) then
    raise exception 'Não é permitido mover a participação para outra obra ou usuário.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Impede ficar sem administrador e impede trocar a empresa de um vínculo.
create or replace function private.guard_org_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
    raise exception 'Não é permitido mover o vínculo para outra empresa ou usuário.' using errcode = '42501';
  end if;
  if old.role = 'admin' and old.status = 'ativo' and (new.role <> 'admin' or new.status <> 'ativo') then
    if not exists (select 1 from public.organization_members
                   where organization_id = old.organization_id and role = 'admin'
                     and status = 'ativo' and id <> old.id) then
      raise exception 'A empresa precisa de pelo menos um administrador ativo.' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Obras: empresa imutável; arquivamento só por administrador; data real de conclusão coerente.
create or replace function private.guard_project_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.organization_id <> old.organization_id then
    raise exception 'Não é permitido transferir a obra para outra empresa.' using errcode = '42501';
  end if;
  if (new.archived_at is distinct from old.archived_at)
     and (select auth.role()) = 'authenticated'
     and not private.is_org_admin(old.organization_id) then
    raise exception 'Somente administradores podem arquivar ou restaurar obras.' using errcode = '42501';
  end if;
  if new.archived_at is not null and old.archived_at is null then
    new.archived_by := (select auth.uid());
  elsif new.archived_at is null then
    new.archived_by := null;
  end if;
  if new.status <> 'concluida' then
    new.actual_end_date := null;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end $$;

create or replace function private.set_created_by()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end $$;

-- Gatilhos
create trigger organizations_updated_at before update on public.organizations for each row execute function private.set_updated_at();
create trigger profiles_updated_at      before update on public.profiles      for each row execute function private.set_updated_at();
create trigger profiles_guard           before update on public.profiles      for each row execute function private.guard_profile_update();
create trigger org_members_updated_at   before update on public.organization_members for each row execute function private.set_updated_at();
create trigger org_members_guard        before update on public.organization_members for each row execute function private.guard_org_member();
create trigger org_members_created_by   before insert on public.organization_members for each row execute function private.set_created_by();
create trigger org_settings_updated_at  before update on public.org_settings  for each row execute function private.set_updated_at();
create trigger projects_created_by      before insert on public.projects      for each row execute function private.set_created_by();
create trigger projects_updated_at      before update on public.projects      for each row execute function private.set_updated_at();
create trigger projects_row_version     before update on public.projects      for each row execute function private.bump_row_version();
create trigger projects_guard           before update on public.projects      for each row execute function private.guard_project_update();
create trigger project_members_created_by before insert on public.project_members for each row execute function private.set_created_by();
create trigger project_members_updated_at before update on public.project_members for each row execute function private.set_updated_at();
create trigger project_members_guard    before insert or update on public.project_members for each row execute function private.guard_project_member();

create trigger audit_organizations        after insert or update or delete on public.organizations        for each row execute function private.audit_row();
create trigger audit_organization_members after insert or update or delete on public.organization_members for each row execute function private.audit_row();
create trigger audit_org_settings         after insert or update or delete on public.org_settings         for each row execute function private.audit_row();
create trigger audit_projects             after insert or update or delete on public.projects             for each row execute function private.audit_row();
create trigger audit_project_members      after insert or update or delete on public.project_members      for each row execute function private.audit_row();
create trigger audit_profiles             after update on public.profiles                                 for each row execute function private.audit_row();

-- =====================================================================
-- RPC: criação de empresa (cria vínculo de administrador e configurações)
-- =====================================================================
create or replace function public.create_organization(p_name text, p_document text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;
  insert into public.organizations (name, document_number, created_by)
  values (trim(p_name), nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), ''), v_uid)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role, status, created_by)
  values (v_org, v_uid, 'admin', 'ativo', v_uid);

  insert into public.org_settings (organization_id) values (v_org);

  insert into public.units (organization_id, code, name)
  select v_org, u.code, u.name from (values
    ('m','Metro'),('m²','Metro quadrado'),('m³','Metro cúbico'),('kg','Quilograma'),
    ('t','Tonelada'),('un','Unidade'),('sc','Saco'),('L','Litro'),('h','Hora'),('vb','Verba')) as u(code, name);

  insert into public.categories (organization_id, kind, name)
  select v_org, c.kind, c.name from (values
    ('foto','Andamento'),('foto','Antes'),('foto','Depois'),('foto','Ocorrência'),('foto','Segurança'),('foto','Entrega de material'),
    ('ocorrencia','Imprevisto'),('ocorrencia','Acidente'),('ocorrencia','Incidente'),('ocorrencia','Interferência'),
    ('ocorrencia','Problema de execução'),('ocorrencia','Falta de material'),('ocorrencia','Falta de mão de obra'),
    ('ocorrencia','Problema climático'),('ocorrencia','Atraso'),('ocorrencia','Paralisação'),
    ('ocorrencia','Visita técnica'),('ocorrencia','Decisão'),('ocorrencia','Outros'),
    ('documento','Projeto'),('documento','Contrato'),('documento','ART/RRT'),('documento','Licença'),('documento','Outros')
  ) as c(kind, name);

  return v_org;
end $$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

revoke all on function public.my_project_permissions(uuid) from public, anon;
grant execute on function public.my_project_permissions(uuid) to authenticated;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_members enable row level security;
alter table public.org_settings         enable row level security;
alter table public.categories           enable row level security;
alter table public.units                enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.audit_logs           enable row level security;

-- organizations
create policy "membros veem a empresa" on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy "admin altera a empresa" on public.organizations
  for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- profiles
create policy "ver perfis da mesma empresa" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.shares_org(id));
create policy "editar o próprio perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organization_members
create policy "membros veem membros da empresa" on public.organization_members
  for select to authenticated using (user_id = (select auth.uid()) or private.is_org_member(organization_id));
create policy "admin gerencia membros" on public.organization_members
  for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
-- inserção de membros ocorre pela Edge Function de convite (service_role), que valida o administrador.

-- org_settings / categories / units
create policy "membros veem configurações" on public.org_settings
  for select to authenticated using (private.is_org_member(organization_id));
create policy "admin altera configurações" on public.org_settings
  for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

create policy "membros veem categorias" on public.categories
  for select to authenticated using (private.is_org_member(organization_id));
create policy "admin cria categorias" on public.categories
  for insert to authenticated with check (private.is_org_admin(organization_id));
create policy "admin altera categorias" on public.categories
  for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

create policy "membros veem unidades" on public.units
  for select to authenticated using (private.is_org_member(organization_id));
create policy "admin cria unidades" on public.units
  for insert to authenticated with check (private.is_org_admin(organization_id));
create policy "admin altera unidades" on public.units
  for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));

-- projects
create policy "ver obras autorizadas" on public.projects
  for select to authenticated using (private.can_view_project(id));
create policy "admin cria obras" on public.projects
  for insert to authenticated with check (private.is_org_admin(organization_id));
create policy "editar obras com permissão" on public.projects
  for update to authenticated using (private.has_perm(id, 'obra.editar')) with check (private.has_perm(id, 'obra.editar'));

-- project_members
create policy "ver equipe da obra" on public.project_members
  for select to authenticated using (private.can_view_project(project_id));
create policy "admin adiciona membros à obra" on public.project_members
  for insert to authenticated with check (private.is_org_admin(private.project_org(project_id)));
create policy "admin altera membros da obra" on public.project_members
  for update to authenticated using (private.is_org_admin(private.project_org(project_id)))
  with check (private.is_org_admin(private.project_org(project_id)));
create policy "admin remove membros da obra" on public.project_members
  for delete to authenticated using (private.is_org_admin(private.project_org(project_id)));

-- audit_logs: somente leitura para administradores; escrita só por gatilho.
create policy "admin consulta auditoria" on public.audit_logs
  for select to authenticated using (private.is_org_admin(organization_id));

-- Nenhum acesso anônimo a dados.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
