import type { Enums } from './supabase'

type Tone = 'neutral' | 'blue' | 'yellow' | 'green' | 'red' | 'grey'

export const PROJECT_STATUS: Record<Enums<'project_status'>, { label: string; tone: Tone }> = {
  planejamento: { label: 'Planejamento', tone: 'neutral' },
  nao_iniciada: { label: 'Não iniciada', tone: 'grey' },
  em_andamento: { label: 'Em andamento', tone: 'blue' },
  paralisada: { label: 'Paralisada', tone: 'yellow' },
  concluida: { label: 'Concluída', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'red' },
}

export const PROJECT_ROLE: Record<Enums<'project_role'>, { label: string; description: string }> = {
  gestor: { label: 'Gestor de obras', description: 'Edita a obra, aprova e corrige diários, gerencia equipe, atividades e ocorrências.' },
  engenheiro: { label: 'Engenheiro / responsável técnico', description: 'Registra e aprova diários, cuida de atividades e ocorrências e emite relatórios.' },
  encarregado: { label: 'Mestre de obras / encarregado', description: 'Preenche o diário, a equipe, materiais e fotos, e abre ocorrências.' },
  colaborador: { label: 'Colaborador', description: 'Acesso de consulta; o administrador libera ações específicas.' },
}

export const ORG_ROLE: Record<Enums<'org_role'>, string> = { admin: 'Administrador', membro: 'Membro' }

export const MEMBER_STATUS: Record<Enums<'member_status'>, { label: string; tone: Tone }> = {
  ativo: { label: 'Ativo', tone: 'green' },
  convidado: { label: 'Convite pendente', tone: 'yellow' },
  inativo: { label: 'Desativado', tone: 'grey' },
}

export const PROGRESS_METHOD: Record<Enums<'progress_method'>, { label: string; description: string }> = {
  peso_etapa: { label: 'Ponderado por etapas', description: 'Cada etapa tem um peso; dentro da etapa, as atividades contam pelo próprio peso.' },
  peso_atividade: { label: 'Ponderado por atividades', description: 'Soma das atividades pelo peso de cada uma, sem agrupar por etapa.' },
  manual: { label: 'Informado manualmente', description: 'O gestor informa o percentual de avanço da obra.' },
}

/** Permissões ajustáveis por obra (sobrescrevem o padrão do papel). */
export const PERMISSIONS: Array<{ key: string; label: string }> = [
  { key: 'obra.editar', label: 'Editar dados da obra' },
  { key: 'equipe.gerenciar', label: 'Gerenciar equipe da obra' },
  { key: 'diario.criar', label: 'Criar e preencher diários' },
  { key: 'diario.ver_todos', label: 'Ver diários de outros autores' },
  { key: 'diario.aprovar', label: 'Aprovar ou devolver diários' },
  { key: 'diario.corrigir', label: 'Reabrir diário aprovado para correção' },
  { key: 'atividade.gerenciar', label: 'Gerenciar atividades e cronograma' },
  { key: 'ocorrencia.criar', label: 'Abrir ocorrências' },
  { key: 'ocorrencia.gerenciar', label: 'Gerenciar ocorrências' },
  { key: 'foto.enviar', label: 'Enviar fotos' },
  { key: 'documento.enviar', label: 'Enviar documentos' },
  { key: 'relatorio.gerar', label: 'Gerar relatórios' },
]

export const ENTITY_LABEL: Record<string, string> = {
  organizations: 'Empresa', organization_members: 'Usuário da empresa', org_settings: 'Configurações',
  projects: 'Obra', project_members: 'Equipe da obra', project_stages: 'Etapa', activities: 'Atividade',
  workers: 'Pessoa', equipment_allocations: 'Equipamento na obra', daily_reports: 'Diário',
  occurrences: 'Ocorrência', attachments: 'Foto', project_documents: 'Documento', profiles: 'Perfil',
}

export const ACTION_LABEL: Record<string, string> = {
  insert: 'Criação', update: 'Alteração', delete: 'Remoção', archive: 'Arquivamento', convite: 'Convite',
}

/** Rótulos legíveis para os campos que aparecem na auditoria. */
export const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', code: 'Código', status: 'Situação', role: 'Papel', client_name: 'Cliente', client_document: 'CPF/CNPJ do cliente',
  address: 'Endereço', city: 'Cidade', state: 'UF', description: 'Descrição', technical_responsible: 'Responsável técnico',
  start_date: 'Início', expected_end_date: 'Previsão de conclusão', actual_end_date: 'Conclusão real',
  progress_percentage: 'Avanço físico', progress_method: 'Método de avanço', archived_at: 'Arquivada em',
  general_notes: 'Observações', permissions: 'Permissões', document_number: 'CNPJ', report_date: 'Data do diário',
  weather: 'Clima', general_summary: 'Resumo do dia', returned_reason: 'Motivo da devolução', version: 'Versão',
  title: 'Título', priority: 'Prioridade', responsible_user_id: 'Responsável', due_date: 'Prazo',
}

// ---------------------------------------------------------------- diário
export const REPORT_STATUS: Record<Enums<'report_status'>, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'grey' },
  enviado: { label: 'Aguardando aprovação', tone: 'yellow' },
  aprovado: { label: 'Aprovado', tone: 'green' },
  devolvido: { label: 'Devolvido para correção', tone: 'red' },
}

export const WEATHER: Record<Enums<'weather_condition'>, string> = {
  ensolarado: 'Ensolarado', nublado: 'Nublado', chuvoso: 'Chuvoso', chuva_intensa: 'Chuva intensa', outros: 'Outros',
}

export const WORK_CONDITION: Record<Enums<'work_condition'>, { label: string; description: string }> = {
  praticavel: { label: 'Praticável', description: 'Trabalho normal durante o dia.' },
  parcialmente_praticavel: { label: 'Parcialmente praticável', description: 'Parte do dia perdida ou serviços limitados.' },
  impraticavel: { label: 'Impraticável', description: 'Sem condições de trabalho.' },
}

export const EXECUTION_STATUS: Record<Enums<'execution_status'>, { label: string; tone: Tone }> = {
  concluida: { label: 'Concluída', tone: 'green' },
  em_andamento: { label: 'Em andamento', tone: 'blue' },
  nao_executada: { label: 'Não executada', tone: 'grey' },
}

export const ATTENDANCE: Record<Enums<'attendance_status'>, { label: string; tone: Tone }> = {
  presente: { label: 'Presente', tone: 'green' },
  falta: { label: 'Falta', tone: 'red' },
  falta_justificada: { label: 'Falta justificada', tone: 'yellow' },
  atestado: { label: 'Atestado', tone: 'yellow' },
  folga: { label: 'Folga', tone: 'grey' },
}

export const APPROVAL_DECISION: Record<Enums<'approval_decision'>, string> = {
  enviado: 'Enviado para aprovação', aprovado: 'Aprovado', devolvido: 'Devolvido para correção', reaberto_para_correcao: 'Reaberto para correção',
}

// ---------------------------------------------------------------- atividades e ocorrências
export const PRIORITY: Record<Enums<'priority_level'>, { label: string; tone: Tone }> = {
  baixa: { label: 'Baixa', tone: 'grey' }, media: { label: 'Média', tone: 'blue' }, alta: { label: 'Alta', tone: 'yellow' }, critica: { label: 'Crítica', tone: 'red' },
}

export const ACTIVITY_STATUS: Record<Enums<'activity_status'>, { label: string; tone: Tone }> = {
  nao_iniciada: { label: 'Não iniciada', tone: 'grey' }, em_andamento: { label: 'Em andamento', tone: 'blue' },
  bloqueada: { label: 'Bloqueada', tone: 'red' }, concluida: { label: 'Concluída', tone: 'green' }, cancelada: { label: 'Cancelada', tone: 'neutral' },
}

export const OCCURRENCE_STATUS: Record<Enums<'occurrence_status'>, { label: string; tone: Tone }> = {
  aberta: { label: 'Aberta', tone: 'red' }, em_analise: { label: 'Em análise', tone: 'yellow' }, em_andamento: { label: 'Em andamento', tone: 'blue' },
  aguardando_terceiros: { label: 'Aguardando terceiros', tone: 'yellow' }, resolvida: { label: 'Resolvida', tone: 'green' }, encerrada: { label: 'Encerrada', tone: 'grey' },
}

export const options = <T extends string>(map: Record<T, string | { label: string }>) =>
  (Object.entries(map) as Array<[T, string | { label: string }]>).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }))
