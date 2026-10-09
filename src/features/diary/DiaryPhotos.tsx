import { useState } from 'react'
import { useOrg } from '@/auth/AuthProvider'
import { useQuery } from '@/lib/useQuery'
import { EmptyState, ErrorBox, Loading } from '@/ui/components'
import { listPhotos, PhotoGrid, PhotoUploader, PhotoViewer, type Photo } from '../photos/photos'
import type { FullReport } from './api'

/** Fotos do dia: envio direto pela câmera e grade com as fotos vinculadas ao diário. */
export function DiaryPhotosSection({ report, editable, onChange }: { report: FullReport; editable: boolean; onChange: () => void }) {
  const org = useOrg()
  const q = useQuery(`photos:report:${report.id}`, () => listPhotos(org.organization_id, { dailyReportId: report.id }))
  const [open, setOpen] = useState<Photo | null>(null)
  return (
    <>
      {editable && (
        <>
          <PhotoUploader meta={{ projectId: report.project_id, dailyReportId: report.id }} onUploaded={() => { void q.refetch(); onChange() }} />
          <p className="field-hint mt-8">As fotos ficam na galeria da obra, ligadas a este diário. Data e hora da câmera são preservadas quando o arquivo as tiver.</p>
        </>
      )}
      <ErrorBox error={q.error} onRetry={q.refetch} />
      <div className="mt-16">
        {q.loading && !q.data ? <Loading /> : !q.data?.length ? <EmptyState icon="foto" title="Nenhuma foto neste diário" /> : (
          <PhotoGrid photos={q.data} onOpen={setOpen} />
        )}
      </div>
      {open && <PhotoViewer photo={open} canEdit={editable} onClose={() => setOpen(null)} onChanged={() => { setOpen(null); void q.refetch() }} />}
    </>
  )
}
