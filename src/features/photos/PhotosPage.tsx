import { useEffect, useState } from 'react'
import { useSearchParams } from '@/app/router'
import { useOrg } from '@/auth/AuthProvider'
import { EmptyState, PageHeader, SelectField } from '@/ui/components'
import { useProjectOptions, useProjectPerms } from '../projects/hooks'
import { PhotoGallery } from './photos'

export function PhotosPage() {
  const org = useOrg()
  const params = useSearchParams()
  const projects = useProjectOptions(org.organization_id, true)
  const [project, setProject] = useState(params.get('obra') ?? '')
  const perms = useProjectPerms(project || null)
  useEffect(() => { if (!project && projects.data?.length === 1) setProject(projects.data[0].id) }, [projects.data, project])
  const archived = !!projects.data?.find((p) => p.id === project)?.archived_at
  return (
    <>
      <PageHeader title="Registro fotográfico" subtitle="Fotos das obras em ordem cronológica, com legenda, local e categoria." />
      <div className="toolbar">
        <SelectField label="Obra" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Selecione a obra"
          options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}${p.archived_at ? ' (arquivada)' : ''}` }))} />
      </div>
      {!project ? <EmptyState icon="foto" title="Escolha uma obra">As fotos são organizadas por obra e por dia.</EmptyState> : (
        <PhotoGallery key={project} projectId={project} canUpload={perms.can('foto.enviar') && !archived} canEdit={perms.can('obra.editar')} />
      )}
    </>
  )
}
