// Traduz erros do Supabase/Postgres/rede em mensagens claras em português.
// Regra: nunca confirmar um salvamento sem resposta positiva do servidor.

export class AppError extends Error {
  constructor(message: string, readonly kind: 'rede' | 'permissao' | 'conflito' | 'validacao' | 'nao_encontrado' | 'desconhecido', readonly cause?: unknown) {
    super(message)
  }
}

type PgLike = { code?: string; message?: string; details?: string | null; hint?: string | null; status?: number; name?: string }

const CONSTRAINT_MESSAGES: Record<string, string> = {
  projects_organization_id_code_key: 'Já existe uma obra com este código nesta empresa.',
  daily_reports_one_main_per_day: 'Já existe um diário principal para esta obra nesta data. Abra o existente ou crie um diário complementar.',
  projects_actual_end_only_when_done: 'A data real de conclusão só pode ser preenchida com a obra concluída.',
  projects_dates_order: 'A previsão de conclusão deve ser posterior à data de início.',
  projects_actual_after_start: 'A data real de conclusão deve ser posterior à data de início.',
  organization_members_organization_id_user_id_key: 'Este usuário já faz parte da empresa.',
  project_members_project_id_user_id_key: 'Este usuário já faz parte da equipe desta obra.',
  units_organization_id_code_key: 'Já existe uma unidade com este código.',
  categories_organization_id_kind_name_key: 'Já existe uma categoria com este nome.',
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new AppError('Sem conexão com a internet. Nada foi salvo; tente novamente quando a conexão voltar.', 'rede', err)
  }
  const e = (err ?? {}) as PgLike
  const msg = e.message ?? String(err)

  if (e.name === 'TypeError' && /fetch|network|Failed to fetch|Load failed/i.test(msg)) {
    return new AppError('Não foi possível falar com o servidor. Nada foi salvo; verifique a conexão e tente de novo.', 'rede', err)
  }
  if (e.name === 'AuthApiError' || e.name === 'AuthError' || e.name === 'AuthWeakPasswordError') {
    if (/Invalid login credentials/i.test(msg)) return new AppError('E-mail ou senha incorretos.', 'validacao', err)
    if (/Email not confirmed/i.test(msg)) return new AppError('Confirme seu e-mail pelo link enviado antes de entrar.', 'validacao', err)
    if (/rate limit|too many/i.test(msg)) return new AppError('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.', 'validacao', err)
    if (/should be different/i.test(msg)) return new AppError('A nova senha precisa ser diferente da atual.', 'validacao', err)
    if (/weak|Password should/i.test(msg)) return new AppError('Senha fraca. Use pelo menos 10 caracteres, com letras e números.', 'validacao', err)
    if (/expired|invalid.*(link|token)|otp/i.test(msg)) return new AppError('O link expirou ou já foi usado. Solicite um novo.', 'validacao', err)
  }

  switch (e.code) {
    case '23505': {
      const key = Object.keys(CONSTRAINT_MESSAGES).find((k) => msg.includes(k) || e.details?.includes(k))
      return new AppError(key ? CONSTRAINT_MESSAGES[key] : 'Registro duplicado: já existe um item com esses dados.', 'validacao', err)
    }
    case '23514': {
      const key = Object.keys(CONSTRAINT_MESSAGES).find((k) => msg.includes(k))
      if (key) return new AppError(CONSTRAINT_MESSAGES[key], 'validacao', err)
      if (/violates check constraint/.test(msg)) return new AppError('Algum valor está fora do permitido. Confira percentuais, datas e quantidades.', 'validacao', err)
      return new AppError(msg, 'validacao', err)
    }
    case '23503': return new AppError('Este registro está ligado a outros dados e não pode ser removido.', 'validacao', err)
    case '23502': return new AppError('Há um campo obrigatório sem preenchimento.', 'validacao', err)
    case '42501': {
      if (/row-level security/i.test(msg)) return new AppError('Você não tem permissão para esta ação nesta obra.', 'permissao', err)
      return new AppError(msg, 'permissao', err)
    }
    case '40001': return new AppError(msg || 'Outra pessoa alterou este registro. Recarregue antes de salvar.', 'conflito', err)
    case 'P0002': return new AppError(msg || 'Registro não encontrado ou sem acesso.', 'nao_encontrado', err)
    case 'PGRST116': return new AppError('Registro não encontrado ou você não tem acesso a ele.', 'nao_encontrado', err)
    case '22P02': return new AppError('Valor em formato inválido.', 'validacao', err)
    case 'P0001': return new AppError(msg, 'validacao', err)
  }
  if (e.status === 413 || /exceeded the maximum allowed size|Payload too large/i.test(msg)) {
    return new AppError('Arquivo maior que o limite permitido.', 'validacao', err)
  }
  if (/mime type .* is not supported|invalid_mime_type/i.test(msg)) {
    return new AppError('Tipo de arquivo não permitido.', 'validacao', err)
  }
  return new AppError(msg || 'Erro inesperado. Tente novamente.', 'desconhecido', err)
}

/** Lança AppError quando a resposta do Supabase traz erro; devolve os dados caso contrário. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error)
  return res.data
}

/** Como unwrap, mas exige um registro (falha clara se vier vazio). */
export function unwrapOne<T>(res: { data: T | null; error: unknown }): T {
  const row = unwrap(res)
  if (row === null || row === undefined) throw new AppError('O servidor não devolveu o registro salvo. Recarregue para conferir.', 'desconhecido')
  return row
}

/** Exige que uma atualização com controle de versão tenha afetado uma linha. */
export function requireUpdated<T>(rows: T[] | null): T {
  if (!rows || rows.length === 0) {
    throw new AppError('Este registro foi alterado por outra pessoa enquanto você editava (ou você perdeu acesso). Recarregue para ver a versão atual; suas alterações não foram salvas.', 'conflito')
  }
  return rows[0]
}
