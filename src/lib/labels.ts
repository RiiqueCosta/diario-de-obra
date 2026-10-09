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
