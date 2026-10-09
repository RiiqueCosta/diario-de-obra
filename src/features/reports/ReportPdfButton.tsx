import { Button, ErrorBox } from '@/ui/components'
import { PdfPreview, useReportGenerator } from './ReportsPage'

/** Gera o PDF de um diário específico, com pré-visualização. */
export function ReportPdfButton({ reportId }: { kind: 'diario'; reportId: string }) {
  const gen = useReportGenerator()
  return (
    <>
      <Button variant="secondary" icon="relatorio" loading={!!gen.busy} title={gen.busy ?? undefined}
        onClick={() => void gen.run({ kind: 'diario', reportId, includePhotos: true, includeSignatures: true, maxPhotos: 40 })}>
        {gen.busy ? 'Gerando PDF…' : 'PDF'}
      </Button>
      {gen.error && <div style={{ flexBasis: '100%' }}><ErrorBox error={gen.error} /></div>}
      {gen.result && <PdfPreview result={gen.result} onClose={gen.clear} />}
    </>
  )
}
