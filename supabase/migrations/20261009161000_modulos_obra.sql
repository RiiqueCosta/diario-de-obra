-- =====================================================================
-- Diário de Obra — Migração 2: módulos (cronograma, diário, equipe,
-- materiais, equipamentos, ocorrências, anexos, notificações) + RLS
-- =====================================================================

create type public.priority_level      as enum ('baixa', 'media', 'alta', 'critica');
create type public.activity_status     as enum ('nao_iniciada', 'em_andamento', 'bloqueada', 'concluida', 'cancelada');
create type public.report_kind         as enum ('principal', 'complementar');
create type public.report_status       as enum ('rascunho', 'enviado', 'aprovado', 'devolvido');
create type public.weather_condition   as enum ('ensolarado', 'nublado', 'chuvoso', 'chuva_intensa', 'outros');
create type public.work_condition      as enum ('praticavel', 'parcialmente_praticavel', 'impraticavel');
create type public.execution_status    as enum ('concluida', 'em_andamento', 'nao_executada');
create type public.attendance_status   as enum ('presente', 'falta', 'falta_justificada', 'atestado', 'folga');
create type public.equipment_usage     as enum ('operando', 'parado', 'indisponivel', 'com_defeito');
create type public.occurrence_status   as enum ('aberta', 'em_analise', 'em_andamento', 'aguardando_terceiros', 'resolvida', 'encerrada');
create type public.approval_decision   as enum ('enviado', 'aprovado', 'devolvido', 'reaberto_para_correcao');
create type public.attachment_kind     as enum ('foto', 'documento');
create type public.record_status       as enum ('ativo', 'inativo');

-- ---------------------------------------------------------------------
-- Funções auxiliares adicionais
-- ---------------------------------------------------------------------
-- Gestor da empresa: administrador ou gestor em alguma obra ativa da empresa.
create or replace function private.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_admin(p_org) or (private.is_org_member(p_org) and exists (
    select 1 from public.project_members pm join public.projects p on p.id = pm.project_id
    where p.organization_id = p_org and pm.user_id = (select auth.uid()) and pm.role = 'gestor'));
$$;

-- Pode registrar itens de campo (materiais/equipamentos no catálogo).
create or replace function private.can_field_register(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_admin(p_org) or (private.is_org_member(p_org) and exists (
    select 1 from public.project_members pm join public.projects p on p.id = pm.project_id
    where p.organization_id = p_org and pm.user_id = (select auth.uid())
      and pm.role in ('gestor', 'engenheiro', 'encarregado')));
$$;

create or replace function private.project_is_open(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = p_project and archived_at is null and status <> 'cancelada');
$$;

-- Contadores por obra (códigos sequenciais legíveis: OC-0001, ...)
create table public.project_counters (
  project_id uuid not null references public.projects(id) on delete restrict,
  kind       text not null,
  last_value int  not null default 0,
  primary key (project_id, kind)
);
alter table public.project_counters enable row level security; -- sem políticas: acesso só interno

create or replace function private.next_counter(p_project uuid, p_kind text)
returns int language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.project_counters (project_id, kind, last_value) values (p_project, p_kind, 1)
  on conflict (project_id, kind) do update set last_value = public.project_counters.last_value + 1
  returning last_value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Etapas e atividades (cronograma)
-- ---------------------------------------------------------------------
create table public.project_stages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 200),
  description text,
  sequence    int  not null default 0,
  weight      numeric(9,3) not null default 1 check (weight >= 0),
  status      public.activity_status not null default 'nao_iniciada',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index project_stages_project_idx on public.project_stages (project_id, sequence);

create table public.activities (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete restrict,
  stage_id            uuid references public.project_stages(id) on delete restrict,
  title               text not null check (length(trim(title)) between 1 and 300),
  description         text,
  location            text,
  responsible_user_id uuid references public.profiles(id) on delete restrict,
  planned_start_date  date,
  planned_end_date    date,
  actual_start_date   date,
  actual_end_date     date,
  progress_percentage numeric(5,2) not null default 0 check (progress_percentage between 0 and 100),
  weight              numeric(9,3) not null default 1 check (weight >= 0),
  planned_quantity    numeric(14,3) check (planned_quantity is null or planned_quantity >= 0),
  unit                text,
  priority            public.priority_level not null default 'media',
  status              public.activity_status not null default 'nao_iniciada',
  notes               text,
  row_version         int not null default 1,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint activities_planned_order check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date),
  constraint activities_actual_end_only_done check (actual_end_date is null or status = 'concluida'),
  constraint activities_done_is_100 check (status <> 'concluida' or progress_percentage = 100)
);
create index activities_project_status_idx on public.activities (project_id, status);
create index activities_project_due_idx    on public.activities (project_id, planned_end_date) where status not in ('concluida', 'cancelada');
create index activities_responsible_idx    on public.activities (responsible_user_id) where status not in ('concluida', 'cancelada');
create index activities_stage_idx          on public.activities (stage_id);

create table public.activity_dependencies (
  activity_id   uuid not null references public.activities(id) on delete restrict,
  depends_on_id uuid not null references public.activities(id) on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (activity_id, depends_on_id),
  constraint activity_dependencies_not_self check (activity_id <> depends_on_id)
);
create index activity_dependencies_depends_idx on public.activity_dependencies (depends_on_id);

-- ---------------------------------------------------------------------
-- Pessoas (cadastro independente de conta de acesso)
-- ---------------------------------------------------------------------
create table public.workers (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  user_id             uuid references public.profiles(id) on delete restrict, -- opcional: quando a pessoa também tem login
  name                text not null check (length(trim(name)) between 2 and 200),
  job_title           text not null check (length(trim(job_title)) between 1 and 100),
  company_name        text,      -- empresa terceirizada, quando aplicável
  contact_information text,      -- somente contato profissional
  status              public.record_status not null default 'ativo',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index workers_org_status_idx on public.workers (organization_id, status, name);

create table public.worker_projects (
  worker_id  uuid not null references public.workers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (worker_id, project_id)
);
create index worker_projects_project_idx on public.worker_projects (project_id);

-- ---------------------------------------------------------------------
-- Materiais e equipamentos (catálogo + alocação)
-- ---------------------------------------------------------------------
create table public.materials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name            text not null check (length(trim(name)) between 1 and 200),
  unit            text not null check (length(trim(unit)) between 1 and 20),
  status          public.record_status not null default 'ativo',
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, name, unit)
);

create table public.equipment (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,
  name                text not null check (length(trim(name)) between 1 and 200),
  identification_code text,
  status              public.record_status not null default 'ativo',
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index equipment_org_code_uidx on public.equipment (organization_id, identification_code) where identification_code is not null;

create table public.equipment_allocations (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete restrict,
  equipment_id        uuid not null references public.equipment(id) on delete restrict,
  responsible_user_id uuid references public.profiles(id) on delete restrict,
  start_date          date not null,
  end_date            date,
  condition           public.equipment_usage not null default 'operando',
  notes               text,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint equipment_allocations_period check (end_date is null or end_date >= start_date)
);
create index equipment_allocations_project_idx on public.equipment_allocations (project_id, start_date desc);

-- ---------------------------------------------------------------------
-- Diário de obra
-- ---------------------------------------------------------------------
create table public.daily_reports (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete restrict,
  report_date         date not null,
  kind                public.report_kind not null default 'principal',
  author_user_id      uuid not null references public.profiles(id) on delete restrict,
  start_time          time,
  end_time            time,
  weather             public.weather_condition,
  weather_afternoon   public.weather_condition,
  temperature_c       numeric(4,1) check (temperature_c is null or temperature_c between -20 and 60),
  weather_notes       text,
  weather_impact      text,
  work_conditions     public.work_condition,
  general_summary     text,
  no_execution_reason text,   -- obrigatório no envio quando não há serviços registrados
  next_day_plan       text,
  pending_items       text,
  final_notes         text,
  technical_notes     text,   -- observações técnicas do engenheiro
  status              public.report_status not null default 'rascunho',
  submitted_at        timestamptz,
  approved_by         uuid references public.profiles(id) on delete restrict,
  approved_at         timestamptz,
  returned_reason     text,
  version             int not null default 1,
  row_version         int not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint daily_reports_time_order check (end_time is null or start_time is null or end_time > start_time),
  constraint daily_reports_approved_fields check (status <> 'aprovado' or (approved_by is not null and approved_at is not null))
);
-- Regra 5: um diário principal por obra e data; complementares ilimitados.
create unique index daily_reports_one_main_per_day on public.daily_reports (project_id, report_date) where kind = 'principal';
create index daily_reports_project_date_idx on public.daily_reports (project_id, report_date desc);
create index daily_reports_status_idx       on public.daily_reports (status, project_id);
create index daily_reports_author_idx       on public.daily_reports (author_user_id, report_date desc);

create table public.daily_report_activities (
  id                  uuid primary key default gen_random_uuid(),
  daily_report_id     uuid not null references public.daily_reports(id) on delete cascade,
  activity_id         uuid references public.activities(id) on delete restrict,
  stage_name          text,
  description         text not null check (length(trim(description)) between 1 and 2000),
  location            text,
  quantity            numeric(14,3) check (quantity is null or quantity >= 0),
  unit                text,
  team_description    text,
  progress_percentage numeric(5,2) check (progress_percentage is null or progress_percentage between 0 and 100),
  execution_status    public.execution_status not null default 'em_andamento',
  observations        text,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now()
);
create index daily_report_activities_report_idx   on public.daily_report_activities (daily_report_id, sort_order);
create index daily_report_activities_activity_idx on public.daily_report_activities (activity_id);

create table public.daily_report_workers (
  id                uuid primary key default gen_random_uuid(),
  daily_report_id   uuid not null references public.daily_reports(id) on delete cascade,
  worker_id         uuid not null references public.workers(id) on delete restrict,
  activity_id       uuid references public.activities(id) on delete restrict,
  job_title         text,   -- função no dia (cópia para histórico)
  company_name      text,
  attendance_status public.attendance_status not null default 'presente',
  hours_worked      numeric(4,2) check (hours_worked is null or hours_worked between 0 and 24),
  observations      text,
  created_at        timestamptz not null default now(),
  unique (daily_report_id, worker_id)
);
create index daily_report_workers_worker_idx on public.daily_report_workers (worker_id);

-- Equipes contabilizadas por quantidade (ex.: terceirizada com 6 serventes), sem cadastro nominal.
create table public.daily_report_crews (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  company_name    text,
  job_title       text not null check (length(trim(job_title)) between 1 and 100),
  quantity        int not null check (quantity between 0 and 1000),
  absent_quantity int not null default 0 check (absent_quantity between 0 and 1000),
  activity_id     uuid references public.activities(id) on delete restrict,
  observations    text,
  created_at      timestamptz not null default now()
);
create index daily_report_crews_report_idx on public.daily_report_crews (daily_report_id);

create table public.daily_report_materials (
  id                uuid primary key default gen_random_uuid(),
  daily_report_id   uuid not null references public.daily_reports(id) on delete cascade,
  material_id       uuid not null references public.materials(id) on delete restrict,
  quantity_received numeric(14,3) not null default 0 check (quantity_received >= 0),
  quantity_used     numeric(14,3) not null default 0 check (quantity_used >= 0),
  supplier_name     text,
  invoice_number    text,
  shortage          boolean not null default false,
  observations      text,
  created_at        timestamptz not null default now()
);
create index daily_report_materials_report_idx   on public.daily_report_materials (daily_report_id);
create index daily_report_materials_material_idx on public.daily_report_materials (material_id);

create table public.daily_report_equipment (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  equipment_id    uuid not null references public.equipment(id) on delete restrict,
  usage_status    public.equipment_usage not null default 'operando',
  hours_used      numeric(4,2) check (hours_used is null or hours_used between 0 and 24),
  observations    text,
  created_at      timestamptz not null default now()
);
create index daily_report_equipment_report_idx on public.daily_report_equipment (daily_report_id);

create table public.daily_report_approvals (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports(id) on delete restrict,
  version          int not null,
  reviewer_user_id uuid not null references public.profiles(id) on delete restrict,
  decision         public.approval_decision not null,
  comments         text,
  decided_at       timestamptz not null default now()
);
create index daily_report_approvals_report_idx on public.daily_report_approvals (daily_report_id, decided_at);

-- Fotografia completa de cada versão aprovada (e de cada versão reaberta para correção).
create table public.daily_report_versions (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete restrict,
  version         int not null,
  snapshot        jsonb not null,
  reason          text,
  created_by      uuid references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  unique (daily_report_id, version)
);

-- ---------------------------------------------------------------------
-- Ocorrências e pendências
-- ---------------------------------------------------------------------
create table public.occurrences (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references public.projects(id) on delete restrict,
  daily_report_id        uuid references public.daily_reports(id) on delete set null,
  activity_id            uuid references public.activities(id) on delete restrict,
  code                   text not null,
  category               text not null check (length(trim(category)) between 1 and 100),
  title                  text not null check (length(trim(title)) between 3 and 300),
  description            text not null check (length(trim(description)) between 1 and 5000),
  occurred_at            timestamptz not null default now(),
  priority               public.priority_level not null default 'media',
  status                 public.occurrence_status not null default 'aberta',
  responsible_user_id    uuid references public.profiles(id) on delete restrict,
  due_date               date,
  actions_taken          text,   -- providências tomadas
  decision               text,   -- decisões tomadas
  resolution_description text,
  resolved_at            timestamptz,
  closed_at              timestamptz,
  row_version            int not null default 1,
  created_by             uuid not null references public.profiles(id) on delete restrict,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (project_id, code)
);
create index occurrences_project_status_idx on public.occurrences (project_id, status);
create index occurrences_responsible_idx    on public.occurrences (responsible_user_id) where status not in ('resolvida', 'encerrada');
create index occurrences_due_idx            on public.occurrences (due_date) where status not in ('resolvida', 'encerrada');
create index occurrences_report_idx         on public.occurrences (daily_report_id);

create table public.occurrence_history (
  id              uuid primary key default gen_random_uuid(),
  occurrence_id   uuid not null references public.occurrences(id) on delete restrict,
  user_id         uuid references public.profiles(id) on delete restrict,
  action          text not null,
  previous_values jsonb,
  new_values      jsonb,
  created_at      timestamptz not null default now()
);
create index occurrence_history_occ_idx on public.occurrence_history (occurrence_id, created_at);

create table public.occurrence_comments (
  id            uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.occurrences(id) on delete restrict,
  user_id       uuid not null references public.profiles(id) on delete restrict,
  body          text not null check (length(trim(body)) between 1 and 5000),
  created_at    timestamptz not null default now()
);
create index occurrence_comments_occ_idx on public.occurrence_comments (occurrence_id, created_at);

-- ---------------------------------------------------------------------
-- Anexos (fotos) e documentos da obra
-- ---------------------------------------------------------------------
create table public.attachments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  project_id           uuid not null references public.projects(id) on delete restrict,
  daily_report_id      uuid references public.daily_reports(id) on delete set null,
  occurrence_id        uuid references public.occurrences(id) on delete restrict,
  activity_id          uuid references public.activities(id) on delete restrict,
  kind                 public.attachment_kind not null default 'foto',
  uploaded_by          uuid not null references public.profiles(id) on delete restrict,
  file_name            text not null,
  storage_key          text not null unique,
  thumbnail_key        text unique,
  mime_type            text not null,
  file_size            bigint not null check (file_size > 0),
  checksum_sha256      text,
  width                int,
  height               int,
  title                text,
  caption              text,
  category             text,
  location_description text,   -- ambiente/local informado pelo usuário
  include_in_reports   boolean not null default true,
  captured_at          timestamptz,  -- somente se extraído do arquivo (EXIF); nunca inventado
  latitude             numeric(9,6), -- somente com consentimento explícito
  longitude            numeric(9,6),
  uploaded_at          timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  deleted_by           uuid references public.profiles(id) on delete restrict,
  constraint attachments_geo_pair check ((latitude is null) = (longitude is null))
);
create index attachments_project_date_idx on public.attachments (project_id, uploaded_at desc) where deleted_at is null;
create index attachments_report_idx       on public.attachments (daily_report_id) where deleted_at is null;
create index attachments_occurrence_idx   on public.attachments (occurrence_id) where deleted_at is null;
create index attachments_activity_idx     on public.attachments (activity_id) where deleted_at is null;

create table public.project_documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  file_name   text not null,
  storage_key text not null unique,
  mime_type   text not null,
  file_size   bigint not null check (file_size > 0),
  category    text,
  description text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  uuid references public.profiles(id) on delete restrict
);
create index project_documents_project_idx on public.project_documents (project_id, created_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Notificações internas
-- ---------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id         uuid not null references public.profiles(id) on delete restrict,
  project_id      uuid references public.projects(id) on delete restrict,
  type            text not null,
  title           text not null,
  message         text not null,
  link            text,
  entity_type     text,
  entity_id       uuid,
  dedupe_key      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx        on public.notifications (user_id, created_at desc);
create unique index notifications_dedupe_uidx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

-- =====================================================================
-- Funções de autorização do diário
-- =====================================================================
create or replace function private.can_view_report(p_report uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.daily_reports r
    where r.id = p_report
      and private.can_view_project(r.project_id)
      and (r.author_user_id = (select auth.uid())
           or private.has_perm(r.project_id, 'diario.ver_todos')
           or private.has_perm(r.project_id, 'diario.aprovar')));
$$;

-- Conteúdo editável: rascunho/devolvido, pelo autor (com diario.criar)
-- ou, quando devolvido, por quem tem diario.corrigir.
create or replace function private.can_edit_report(p_report uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.daily_reports r
    where r.id = p_report
      and r.status in ('rascunho', 'devolvido')
      and private.project_is_open(r.project_id)
      and ((r.author_user_id = (select auth.uid()) and private.has_perm(r.project_id, 'diario.criar'))
           or (r.status = 'devolvido' and private.has_perm(r.project_id, 'diario.corrigir'))));
$$;

grant execute on all functions in schema private to authenticated, service_role;

-- =====================================================================
-- Gatilhos de integridade
-- =====================================================================

-- Diário: só transições pelas funções de fluxo; conteúdo bloqueado fora de rascunho/devolvido.
create or replace function private.guard_daily_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_transition boolean := coalesce(current_setting('app.report_transition', true), '') = 'on';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if tg_op = 'INSERT' then
    if not private.project_is_open(new.project_id) then
      raise exception 'Obra arquivada ou cancelada não aceita novos diários.' using errcode = '23514';
    end if;
    if new.report_date > v_today then
      raise exception 'A data do diário não pode ser futura.' using errcode = '23514';
    end if;
    if new.kind = 'complementar' and not coalesce((select s.allow_complementary_reports from public.org_settings s
        join public.projects p on p.organization_id = s.organization_id where p.id = new.project_id), true) then
      raise exception 'A empresa não permite diários complementares.' using errcode = '23514';
    end if;
    if (select auth.uid()) is not null then
      new.author_user_id := (select auth.uid());
    end if;
    if not v_transition then
      new.status := 'rascunho'; new.submitted_at := null; new.approved_by := null;
      new.approved_at := null; new.returned_reason := null; new.version := 1;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.project_id <> old.project_id or new.author_user_id <> old.author_user_id or new.created_at <> old.created_at then
    raise exception 'Obra, autor e data de criação do diário não podem ser alterados.' using errcode = '42501';
  end if;
  if not v_transition then
    if old.status not in ('rascunho', 'devolvido') then
      raise exception 'Diário % não pode ser editado. Use o procedimento de correção autorizado.',
        case old.status when 'aprovado' then 'aprovado' else 'enviado para aprovação' end using errcode = '42501';
    end if;
    if new.status is distinct from old.status or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at or new.submitted_at is distinct from old.submitted_at
       or new.version is distinct from old.version or new.returned_reason is distinct from old.returned_reason then
      raise exception 'Situação do diário só muda pelo fluxo de aprovação.' using errcode = '42501';
    end if;
    if new.report_date > v_today then
      raise exception 'A data do diário não pode ser futura.' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end $$;

create or replace function private.guard_daily_report_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'rascunho' or old.submitted_at is not null or old.version <> 1 then
    raise exception 'Somente rascunhos nunca enviados podem ser descartados.' using errcode = '42501';
  end if;
  return old;
end $$;

-- Itens filhos: atividade/funcionário referenciados precisam ser da mesma obra/empresa.
create or replace function private.guard_report_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v_org uuid; v_row jsonb := to_jsonb(new);
begin
  select r.project_id, p.organization_id into v_project, v_org
  from public.daily_reports r join public.projects p on p.id = r.project_id
  where r.id = new.daily_report_id;

  if (v_row ->> 'activity_id') is not null and not exists (
      select 1 from public.activities where id = (v_row ->> 'activity_id')::uuid and project_id = v_project) then
    raise exception 'A atividade não pertence a esta obra.' using errcode = '23514';
  end if;
  if (v_row ->> 'worker_id') is not null and not exists (
      select 1 from public.workers where id = (v_row ->> 'worker_id')::uuid and organization_id = v_org) then
    raise exception 'O funcionário não pertence a esta empresa.' using errcode = '23514';
  end if;
  if (v_row ->> 'material_id') is not null and not exists (
      select 1 from public.materials where id = (v_row ->> 'material_id')::uuid and organization_id = v_org) then
    raise exception 'O material não pertence a esta empresa.' using errcode = '23514';
  end if;
  if (v_row ->> 'equipment_id') is not null and not exists (
      select 1 from public.equipment where id = (v_row ->> 'equipment_id')::uuid and organization_id = v_org) then
    raise exception 'O equipamento não pertence a esta empresa.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.daily_report_id <> old.daily_report_id then
    raise exception 'Não é permitido mover itens entre diários.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Atividades: coerência de etapa/responsável e datas automáticas.
create or replace function private.guard_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid := private.project_org(new.project_id);
begin
  if tg_op = 'UPDATE' and new.project_id <> old.project_id then
    raise exception 'Não é permitido mover a atividade para outra obra.' using errcode = '42501';
  end if;
  if new.stage_id is not null and not exists (
      select 1 from public.project_stages where id = new.stage_id and project_id = new.project_id) then
    raise exception 'A etapa não pertence a esta obra.' using errcode = '23514';
  end if;
  if new.responsible_user_id is not null and not exists (
      select 1 from public.organization_members where organization_id = v_org and user_id = new.responsible_user_id) then
    raise exception 'O responsável não pertence à empresa.' using errcode = '23514';
  end if;
  if new.status = 'concluida' then
    new.progress_percentage := 100;
    new.actual_end_date := coalesce(new.actual_end_date, (now() at time zone 'America/Sao_Paulo')::date);
  else
    new.actual_end_date := null;
  end if;
  if new.status in ('em_andamento', 'concluida') and new.actual_start_date is null then
    new.actual_start_date := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  if tg_op = 'UPDATE' then
    new.row_version := old.row_version + 1;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create or replace function private.guard_activity_dependency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select project_id from public.activities where id = new.activity_id)
     is distinct from (select project_id from public.activities where id = new.depends_on_id) then
    raise exception 'Dependências só entre atividades da mesma obra.' using errcode = '23514';
  end if;
  -- evita ciclos
  if exists (
    with recursive chain(id) as (
      select new.depends_on_id
      union
      select d.depends_on_id from public.activity_dependencies d join chain c on d.activity_id = c.id)
    select 1 from chain where id = new.activity_id) then
    raise exception 'Esta dependência criaria um ciclo no cronograma.' using errcode = '23514';
  end if;
  return new;
end $$;

-- Avanço físico ponderado (nunca média simples, salvo se todos os pesos forem iguais).
create or replace function private.compute_project_progress(p_project uuid)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v_method public.progress_method; v_result numeric;
begin
  select progress_method into v_method from public.projects where id = p_project;
  if v_method = 'peso_atividade' or not exists (
      select 1 from public.project_stages where project_id = p_project and archived_at is null and weight > 0) then
    select coalesce(sum(a.weight * a.progress_percentage) / nullif(sum(a.weight), 0), 0) into v_result
    from public.activities a where a.project_id = p_project and a.status <> 'cancelada';
  else
    select coalesce(sum(s.weight * coalesce(sp.progress, 0)) / nullif(sum(s.weight), 0), 0) into v_result
    from public.project_stages s
    left join lateral (
      select sum(a.weight * a.progress_percentage) / nullif(sum(a.weight), 0) as progress
      from public.activities a where a.stage_id = s.id and a.status <> 'cancelada') sp on true
    where s.project_id = p_project and s.archived_at is null;
  end if;
  return round(least(greatest(v_result, 0), 100), 2);
end $$;

create or replace function private.refresh_project_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  v_project := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  update public.projects
     set progress_percentage = private.compute_project_progress(v_project)
   where id = v_project and progress_method <> 'manual'
     and progress_percentage is distinct from private.compute_project_progress(v_project);
  return null;
end $$;

-- Recalcular quando o método muda; ignorar row_version se só o avanço automático mudou.
create or replace function private.project_progress_on_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.progress_method <> 'manual' and new.progress_method is distinct from old.progress_method then
    new.progress_percentage := private.compute_project_progress(new.id);
  end if;
  return new;
end $$;

create or replace function private.bump_project_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'progress_percentage' - 'updated_at' - 'row_version')
     is distinct from (to_jsonb(old) - 'progress_percentage' - 'updated_at' - 'row_version') then
    new.row_version := old.row_version + 1;
  end if;
  return new;
end $$;

create or replace trigger projects_row_version before update on public.projects for each row execute function private.bump_project_version();
create trigger projects_progress    before update on public.projects for each row execute function private.project_progress_on_update();

-- Ocorrências: código sequencial, histórico de status/responsável, datas de resolução.
create or replace function private.guard_occurrence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.project_is_open(new.project_id) then
      raise exception 'Obra arquivada ou cancelada não aceita novas ocorrências.' using errcode = '23514';
    end if;
    new.code := 'OC-' || lpad(private.next_counter(new.project_id, 'occurrence')::text, 4, '0');
    if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  else
    if new.project_id <> old.project_id or new.code <> old.code or new.created_by <> old.created_by then
      raise exception 'Obra, código e autor da ocorrência não podem ser alterados.' using errcode = '42501';
    end if;
    new.updated_at := now();
    new.row_version := old.row_version + 1;
  end if;
  if new.daily_report_id is not null and not exists (
      select 1 from public.daily_reports where id = new.daily_report_id and project_id = new.project_id) then
    raise exception 'O diário não pertence a esta obra.' using errcode = '23514';
  end if;
  if new.activity_id is not null and not exists (
      select 1 from public.activities where id = new.activity_id and project_id = new.project_id) then
    raise exception 'A atividade não pertence a esta obra.' using errcode = '23514';
  end if;
  if new.responsible_user_id is not null and not exists (
      select 1 from public.organization_members m join public.projects p on p.organization_id = m.organization_id
      where p.id = new.project_id and m.user_id = new.responsible_user_id) then
    raise exception 'O responsável não pertence à empresa.' using errcode = '23514';
  end if;
  if new.status in ('resolvida', 'encerrada') then
    new.resolved_at := coalesce(new.resolved_at, now());
  else
    new.resolved_at := null;
  end if;
  if new.status = 'encerrada' then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

create or replace function private.log_occurrence_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prev jsonb := '{}'; v_new jsonb := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.occurrence_history (occurrence_id, user_id, action, new_values)
    values (new.id, (select auth.uid()), 'criada',
            jsonb_build_object('status', new.status, 'responsible_user_id', new.responsible_user_id,
                               'priority', new.priority, 'due_date', new.due_date));
    return null;
  end if;
  if new.status is distinct from old.status then
    v_prev := v_prev || jsonb_build_object('status', old.status);
    v_new  := v_new  || jsonb_build_object('status', new.status);
  end if;
  if new.responsible_user_id is distinct from old.responsible_user_id then
    v_prev := v_prev || jsonb_build_object('responsible_user_id', old.responsible_user_id);
    v_new  := v_new  || jsonb_build_object('responsible_user_id', new.responsible_user_id);
  end if;
  if new.priority is distinct from old.priority then
    v_prev := v_prev || jsonb_build_object('priority', old.priority);
    v_new  := v_new  || jsonb_build_object('priority', new.priority);
  end if;
  if new.due_date is distinct from old.due_date then
    v_prev := v_prev || jsonb_build_object('due_date', old.due_date);
    v_new  := v_new  || jsonb_build_object('due_date', new.due_date);
  end if;
  if new.actions_taken is distinct from old.actions_taken or new.resolution_description is distinct from old.resolution_description
     or new.description is distinct from old.description or new.decision is distinct from old.decision then
    v_prev := v_prev || jsonb_build_object('texto', true);
    v_new  := v_new  || jsonb_build_object('actions_taken', new.actions_taken, 'resolution_description', new.resolution_description,
                                           'decision', new.decision);
  end if;
  if v_new <> '{}'::jsonb then
    insert into public.occurrence_history (occurrence_id, user_id, action, previous_values, new_values)
    values (new.id, (select auth.uid()),
            case when new.status is distinct from old.status then 'status_alterado'
                 when new.responsible_user_id is distinct from old.responsible_user_id then 'responsavel_alterado'
                 else 'atualizada' end,
            v_prev, v_new);
  end if;
  return null;
end $$;

-- Anexos: vínculos coerentes e imutáveis; exclusão apenas lógica.
create or replace function private.guard_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.organization_id := private.project_org(new.project_id);
    if (select auth.uid()) is not null then new.uploaded_by := (select auth.uid()); end if;
    if new.storage_key not like new.organization_id::text || '/' || new.project_id::text || '/%' then
      raise exception 'Caminho do arquivo inválido para esta obra.' using errcode = '23514';
    end if;
    if new.thumbnail_key is not null and new.thumbnail_key not like new.organization_id::text || '/' || new.project_id::text || '/%' then
      raise exception 'Caminho da miniatura inválido para esta obra.' using errcode = '23514';
    end if;
  else
    if new.project_id <> old.project_id or new.storage_key <> old.storage_key or new.uploaded_by <> old.uploaded_by
       or new.organization_id <> old.organization_id or new.file_size <> old.file_size or new.mime_type <> old.mime_type then
      raise exception 'Arquivo, obra e autor do anexo não podem ser alterados.' using errcode = '42501';
    end if;
    if new.captured_at is distinct from old.captured_at or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude then
      raise exception 'Metadados de captura não podem ser editados.' using errcode = '42501';
    end if;
    -- anexos de diário enviado/aprovado ficam congelados (exceto seleção para relatório)
    if old.daily_report_id is not null and exists (
        select 1 from public.daily_reports where id = old.daily_report_id and status in ('enviado', 'aprovado'))
       and ((to_jsonb(new) - 'include_in_reports' - 'updated_at') is distinct from (to_jsonb(old) - 'include_in_reports' - 'updated_at')) then
      raise exception 'Fotos de diário enviado ou aprovado não podem ser alteradas ou removidas.' using errcode = '42501';
    end if;
    -- quem não é autor nem editor da obra só pode marcar/desmarcar a foto para relatórios
    if (select auth.uid()) is not null and old.uploaded_by <> (select auth.uid())
       and not private.has_perm(old.project_id, 'obra.editar')
       and (to_jsonb(new) - 'include_in_reports' - 'updated_at') is distinct from (to_jsonb(old) - 'include_in_reports' - 'updated_at') then
      raise exception 'Somente o autor ou o gestor da obra pode alterar ou remover esta foto.' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then
      new.deleted_by := (select auth.uid());
    elsif new.deleted_at is null and old.deleted_at is not null then
      new.deleted_by := null;
    end if;
    new.updated_at := now();
  end if;
  if new.daily_report_id is not null and not exists (
      select 1 from public.daily_reports where id = new.daily_report_id and project_id = new.project_id) then
    raise exception 'O diário não pertence a esta obra.' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.daily_report_id is distinct from old.daily_report_id and new.daily_report_id is not null
     and (select auth.uid()) is not null and not private.can_edit_report(new.daily_report_id) then
    raise exception 'Só é possível vincular fotos a diários em rascunho ou devolvidos.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.daily_report_id is not null and not private.can_edit_report(new.daily_report_id)
     and (select auth.uid()) is not null then
    raise exception 'Só é possível anexar fotos a diários em rascunho ou devolvidos.' using errcode = '42501';
  end if;
  if new.occurrence_id is not null and not exists (
      select 1 from public.occurrences where id = new.occurrence_id and project_id = new.project_id) then
    raise exception 'A ocorrência não pertence a esta obra.' using errcode = '23514';
  end if;
  if new.activity_id is not null and not exists (
      select 1 from public.activities where id = new.activity_id and project_id = new.project_id) then
    raise exception 'A atividade não pertence a esta obra.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.guard_project_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.uploaded_by := (select auth.uid()); end if;
    if new.storage_key not like private.project_org(new.project_id)::text || '/' || new.project_id::text || '/%' then
      raise exception 'Caminho do arquivo inválido para esta obra.' using errcode = '23514';
    end if;
  else
    if new.project_id <> old.project_id or new.storage_key <> old.storage_key or new.uploaded_by <> old.uploaded_by then
      raise exception 'Arquivo, obra e autor do documento não podem ser alterados.' using errcode = '42501';
    end if;
    if new.deleted_at is not null and old.deleted_at is null then new.deleted_by := (select auth.uid()); end if;
  end if;
  return new;
end $$;

create or replace function private.guard_org_scoped_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  else
    if new.organization_id <> old.organization_id then
      raise exception 'Não é permitido mover o registro para outra empresa.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function private.guard_project_scoped()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  else
    if new.project_id <> old.project_id then
      raise exception 'Não é permitido mover o registro para outra obra.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function private.guard_notification_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Somente a marcação de leitura pode ser alterada.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Gatilhos
create trigger project_stages_guard   before insert or update on public.project_stages   for each row execute function private.guard_project_scoped();
create trigger activities_created_by  before insert on public.activities                  for each row execute function private.set_created_by();
create trigger activities_updated_at  before update on public.activities                  for each row execute function private.set_updated_at();
create trigger activities_guard       before insert or update on public.activities        for each row execute function private.guard_activity();
create trigger activities_progress    after insert or update or delete on public.activities for each row execute function private.refresh_project_progress();
create trigger stages_progress        after insert or update or delete on public.project_stages for each row execute function private.refresh_project_progress();
create trigger activity_dependencies_guard before insert on public.activity_dependencies  for each row execute function private.guard_activity_dependency();

create trigger workers_guard          before insert or update on public.workers           for each row execute function private.guard_org_scoped_insert();
create trigger materials_guard        before insert or update on public.materials         for each row execute function private.guard_org_scoped_insert();
create trigger equipment_guard        before insert or update on public.equipment         for each row execute function private.guard_org_scoped_insert();
create trigger equipment_alloc_guard  before insert or update on public.equipment_allocations for each row execute function private.guard_project_scoped();

create trigger daily_reports_guard        before insert or update on public.daily_reports for each row execute function private.guard_daily_report();
create trigger daily_reports_guard_delete before delete on public.daily_reports           for each row execute function private.guard_daily_report_delete();
create trigger dra_guard  before insert or update on public.daily_report_activities for each row execute function private.guard_report_child();
create trigger drw_guard  before insert or update on public.daily_report_workers    for each row execute function private.guard_report_child();
create trigger drc_guard  before insert or update on public.daily_report_crews      for each row execute function private.guard_report_child();
create trigger drm_guard  before insert or update on public.daily_report_materials  for each row execute function private.guard_report_child();
create trigger dre_guard  before insert or update on public.daily_report_equipment  for each row execute function private.guard_report_child();

create trigger occurrences_guard   before insert or update on public.occurrences for each row execute function private.guard_occurrence();
create trigger occurrences_history after insert or update on public.occurrences  for each row execute function private.log_occurrence_history();

create trigger attachments_guard        before insert or update on public.attachments       for each row execute function private.guard_attachment();
create trigger project_documents_guard  before insert or update on public.project_documents for each row execute function private.guard_project_document();
create trigger notifications_guard      before update on public.notifications               for each row execute function private.guard_notification_update();

-- Auditoria
create trigger audit_project_stages        after insert or update or delete on public.project_stages        for each row execute function private.audit_row();
create trigger audit_activities            after insert or update or delete on public.activities            for each row execute function private.audit_row();
create trigger audit_workers               after insert or update or delete on public.workers               for each row execute function private.audit_row();
create trigger audit_equipment_allocations after insert or update or delete on public.equipment_allocations for each row execute function private.audit_row();
create trigger audit_daily_reports         after insert or update or delete on public.daily_reports         for each row execute function private.audit_row();
create trigger audit_occurrences           after insert or update on public.occurrences                     for each row execute function private.audit_row();
create trigger audit_attachments           after insert or update on public.attachments                     for each row execute function private.audit_row();
create trigger audit_project_documents     after insert or update on public.project_documents               for each row execute function private.audit_row();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.project_stages          enable row level security;
alter table public.activities              enable row level security;
alter table public.activity_dependencies   enable row level security;
alter table public.workers                 enable row level security;
alter table public.worker_projects         enable row level security;
alter table public.materials               enable row level security;
alter table public.equipment               enable row level security;
alter table public.equipment_allocations   enable row level security;
alter table public.daily_reports           enable row level security;
alter table public.daily_report_activities enable row level security;
alter table public.daily_report_workers    enable row level security;
alter table public.daily_report_crews      enable row level security;
alter table public.daily_report_materials  enable row level security;
alter table public.daily_report_equipment  enable row level security;
alter table public.daily_report_approvals  enable row level security;
alter table public.daily_report_versions   enable row level security;
alter table public.occurrences             enable row level security;
alter table public.occurrence_history      enable row level security;
alter table public.occurrence_comments     enable row level security;
alter table public.attachments             enable row level security;
alter table public.project_documents       enable row level security;
alter table public.notifications           enable row level security;

-- Etapas / atividades / dependências
create policy "ver etapas" on public.project_stages for select to authenticated using (private.can_view_project(project_id));
create policy "criar etapas" on public.project_stages for insert to authenticated with check (private.has_perm(project_id, 'atividade.gerenciar') and private.project_is_open(project_id));
create policy "alterar etapas" on public.project_stages for update to authenticated using (private.has_perm(project_id, 'atividade.gerenciar')) with check (private.has_perm(project_id, 'atividade.gerenciar'));

create policy "ver atividades" on public.activities for select to authenticated using (private.can_view_project(project_id));
create policy "criar atividades" on public.activities for insert to authenticated with check (private.has_perm(project_id, 'atividade.gerenciar') and private.project_is_open(project_id));
create policy "alterar atividades" on public.activities for update to authenticated
  using (private.has_perm(project_id, 'atividade.gerenciar') or (responsible_user_id = (select auth.uid()) and private.can_view_project(project_id)))
  with check (private.has_perm(project_id, 'atividade.gerenciar') or (responsible_user_id = (select auth.uid()) and private.can_view_project(project_id)));

create policy "ver dependências" on public.activity_dependencies for select to authenticated
  using (private.can_view_project((select project_id from public.activities where id = activity_id)));
create policy "criar dependências" on public.activity_dependencies for insert to authenticated
  with check (private.has_perm((select project_id from public.activities where id = activity_id), 'atividade.gerenciar'));
create policy "remover dependências" on public.activity_dependencies for delete to authenticated
  using (private.has_perm((select project_id from public.activities where id = activity_id), 'atividade.gerenciar'));

-- Pessoas
create policy "ver pessoas da empresa" on public.workers for select to authenticated using (private.is_org_member(organization_id));
create policy "cadastrar pessoas" on public.workers for insert to authenticated with check (private.is_org_manager(organization_id));
create policy "alterar pessoas" on public.workers for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));

create policy "ver alocação de pessoas" on public.worker_projects for select to authenticated using (private.can_view_project(project_id));
create policy "alocar pessoas" on public.worker_projects for insert to authenticated with check (private.has_perm(project_id, 'equipe.gerenciar'));
create policy "desalocar pessoas" on public.worker_projects for delete to authenticated using (private.has_perm(project_id, 'equipe.gerenciar'));

-- Materiais / equipamentos
create policy "ver materiais" on public.materials for select to authenticated using (private.is_org_member(organization_id));
create policy "cadastrar materiais" on public.materials for insert to authenticated with check (private.can_field_register(organization_id));
create policy "alterar materiais" on public.materials for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));

create policy "ver equipamentos" on public.equipment for select to authenticated using (private.is_org_member(organization_id));
create policy "cadastrar equipamentos" on public.equipment for insert to authenticated with check (private.can_field_register(organization_id));
create policy "alterar equipamentos" on public.equipment for update to authenticated using (private.is_org_manager(organization_id)) with check (private.is_org_manager(organization_id));

create policy "ver alocação de equipamentos" on public.equipment_allocations for select to authenticated using (private.can_view_project(project_id));
create policy "alocar equipamentos" on public.equipment_allocations for insert to authenticated with check (private.has_perm(project_id, 'diario.criar'));
create policy "alterar alocação de equipamentos" on public.equipment_allocations for update to authenticated
  using (private.has_perm(project_id, 'equipe.gerenciar') or created_by = (select auth.uid()))
  with check (private.has_perm(project_id, 'diario.criar'));

-- Diários
create policy "ver diários" on public.daily_reports for select to authenticated using (private.can_view_report(id));
create policy "criar diário" on public.daily_reports for insert to authenticated
  with check (private.has_perm(project_id, 'diario.criar') and author_user_id = (select auth.uid()));
create policy "editar diário" on public.daily_reports for update to authenticated
  using (private.can_edit_report(id)) with check (private.can_view_project(project_id));
create policy "descartar rascunho próprio" on public.daily_reports for delete to authenticated
  using (author_user_id = (select auth.uid()) and status = 'rascunho' and submitted_at is null);

-- Itens do diário (mesma regra para todas as tabelas filhas)
create policy "ver itens" on public.daily_report_activities for select to authenticated using (private.can_view_report(daily_report_id));
create policy "incluir itens" on public.daily_report_activities for insert to authenticated with check (private.can_edit_report(daily_report_id));
create policy "alterar itens" on public.daily_report_activities for update to authenticated using (private.can_edit_report(daily_report_id)) with check (private.can_edit_report(daily_report_id));
create policy "remover itens" on public.daily_report_activities for delete to authenticated using (private.can_edit_report(daily_report_id));

create policy "ver itens" on public.daily_report_workers for select to authenticated using (private.can_view_report(daily_report_id));
create policy "incluir itens" on public.daily_report_workers for insert to authenticated with check (private.can_edit_report(daily_report_id));
create policy "alterar itens" on public.daily_report_workers for update to authenticated using (private.can_edit_report(daily_report_id)) with check (private.can_edit_report(daily_report_id));
create policy "remover itens" on public.daily_report_workers for delete to authenticated using (private.can_edit_report(daily_report_id));

create policy "ver itens" on public.daily_report_crews for select to authenticated using (private.can_view_report(daily_report_id));
create policy "incluir itens" on public.daily_report_crews for insert to authenticated with check (private.can_edit_report(daily_report_id));
create policy "alterar itens" on public.daily_report_crews for update to authenticated using (private.can_edit_report(daily_report_id)) with check (private.can_edit_report(daily_report_id));
create policy "remover itens" on public.daily_report_crews for delete to authenticated using (private.can_edit_report(daily_report_id));

create policy "ver itens" on public.daily_report_materials for select to authenticated using (private.can_view_report(daily_report_id));
create policy "incluir itens" on public.daily_report_materials for insert to authenticated with check (private.can_edit_report(daily_report_id));
create policy "alterar itens" on public.daily_report_materials for update to authenticated using (private.can_edit_report(daily_report_id)) with check (private.can_edit_report(daily_report_id));
create policy "remover itens" on public.daily_report_materials for delete to authenticated using (private.can_edit_report(daily_report_id));

create policy "ver itens" on public.daily_report_equipment for select to authenticated using (private.can_view_report(daily_report_id));
create policy "incluir itens" on public.daily_report_equipment for insert to authenticated with check (private.can_edit_report(daily_report_id));
create policy "alterar itens" on public.daily_report_equipment for update to authenticated using (private.can_edit_report(daily_report_id)) with check (private.can_edit_report(daily_report_id));
create policy "remover itens" on public.daily_report_equipment for delete to authenticated using (private.can_edit_report(daily_report_id));

-- Histórico de aprovação e versões: leitura; escrita só pelas funções de fluxo.
create policy "ver histórico de aprovação" on public.daily_report_approvals for select to authenticated using (private.can_view_report(daily_report_id));
create policy "ver versões" on public.daily_report_versions for select to authenticated using (private.can_view_report(daily_report_id));

-- Ocorrências
create policy "ver ocorrências" on public.occurrences for select to authenticated using (private.can_view_project(project_id));
create policy "abrir ocorrência" on public.occurrences for insert to authenticated
  with check (private.has_perm(project_id, 'ocorrencia.criar') and created_by = (select auth.uid()));
create policy "atualizar ocorrência" on public.occurrences for update to authenticated
  using (private.has_perm(project_id, 'ocorrencia.gerenciar')
         or (private.can_view_project(project_id) and responsible_user_id = (select auth.uid()) and status <> 'encerrada')
         or (created_by = (select auth.uid()) and status = 'aberta' and private.has_perm(project_id, 'ocorrencia.criar')))
  with check (private.has_perm(project_id, 'ocorrencia.gerenciar')
         or (private.can_view_project(project_id) and responsible_user_id = (select auth.uid()) and status <> 'encerrada')
         or (created_by = (select auth.uid()) and status = 'aberta'));

create policy "ver histórico da ocorrência" on public.occurrence_history for select to authenticated
  using (private.can_view_project((select project_id from public.occurrences where id = occurrence_id)));

create policy "ver comentários" on public.occurrence_comments for select to authenticated
  using (private.can_view_project((select project_id from public.occurrences where id = occurrence_id)));
create policy "comentar" on public.occurrence_comments for insert to authenticated
  with check (user_id = (select auth.uid())
              and private.can_view_project((select project_id from public.occurrences where id = occurrence_id)));

-- Anexos (fotos)
create policy "ver fotos" on public.attachments for select to authenticated
  using (private.can_view_project(project_id) and (daily_report_id is null or private.can_view_report(daily_report_id)));
create policy "enviar fotos" on public.attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.project_is_open(project_id) and (
    private.has_perm(project_id, 'foto.enviar')
    or (occurrence_id is not null and private.has_perm(project_id, 'ocorrencia.criar'))
    or (daily_report_id is not null and private.can_edit_report(daily_report_id))));
create policy "alterar fotos" on public.attachments for update to authenticated
  using (uploaded_by = (select auth.uid()) or private.has_perm(project_id, 'obra.editar') or private.has_perm(project_id, 'relatorio.gerar'))
  with check (private.can_view_project(project_id));

-- Documentos da obra
create policy "ver documentos" on public.project_documents for select to authenticated using (private.can_view_project(project_id));
create policy "enviar documentos" on public.project_documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.has_perm(project_id, 'documento.enviar'));
create policy "alterar documentos" on public.project_documents for update to authenticated
  using (uploaded_by = (select auth.uid()) or private.has_perm(project_id, 'obra.editar'))
  with check (private.can_view_project(project_id));

-- Notificações: somente as próprias; escrita apenas por funções internas.
create policy "ver minhas notificações" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "marcar como lida" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
