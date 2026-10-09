-- Leitura de obra e diário avaliada com as colunas da própria linha.
-- Motivo: em INSERT ... RETURNING a linha nova ainda não é visível para uma
-- consulta por id dentro de funções STABLE, o que fazia o cadastro falhar.
create or replace function private.can_view_project_row(p_project uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_org_admin(p_org)
      or exists (select 1 from public.project_members pm
                 where pm.project_id = p_project and pm.user_id = (select auth.uid())
                   and private.is_org_member(p_org));
$$;
grant execute on function private.can_view_project_row(uuid, uuid) to authenticated, service_role;

alter policy "ver obras autorizadas" on public.projects
  using (private.can_view_project_row(id, organization_id));

alter policy "ver diários" on public.daily_reports
  using (private.can_view_project(project_id)
         and (author_user_id = (select auth.uid())
              or private.has_perm(project_id, 'diario.ver_todos')
              or private.has_perm(project_id, 'diario.aprovar')));
