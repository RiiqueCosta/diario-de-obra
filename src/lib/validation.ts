// Validações do cliente. Espelham as restrições do banco (CHECK, RLS e gatilhos),
// que continuam sendo a fonte de verdade: o servidor revalida tudo.
import { onlyDigits } from './format'

export type Errors<T> = Partial<Record<keyof T, string>>

export function isValidCPF(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

export function isValidCNPJ(value: string): boolean {
  const d = onlyDigits(value)
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
}

/** CPF ou CNPJ opcional: vazio é aceito; preenchido precisa ser válido. */
export function validateDocument(value: string | null | undefined): string | undefined {
  if (!value || !onlyDigits(value)) return undefined
  const d = onlyDigits(value)
  if (d.length === 11) return isValidCPF(d) ? undefined : 'CPF inválido. Confira os dígitos.'
  if (d.length === 14) return isValidCNPJ(d) ? undefined : 'CNPJ inválido. Confira os dígitos.'
  return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).'
}

export function required(value: unknown, label: string): string | undefined {
  if (value === null || value === undefined) return `Informe ${label}.`
  if (typeof value === 'string' && value.trim() === '') return `Informe ${label}.`
  return undefined
}

export function maxLength(value: string | null | undefined, max: number, label: string): string | undefined {
  if (value && value.length > max) return `${label} deve ter no máximo ${max} caracteres.`
  return undefined
}

export function percent(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || Number.isNaN(value)) return undefined
  if (value < 0 || value > 100) return 'O percentual deve estar entre 0% e 100%.'
  return undefined
}

export function dateOrder(start: string | null | undefined, end: string | null | undefined, msg: string): string | undefined {
  if (start && end && end < start) return msg
  return undefined
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

export function passwordProblems(pw: string): string | undefined {
  if (pw.length < 10) return 'Use pelo menos 10 caracteres.'
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Combine letras e números.'
  return undefined
}

export function firstError<T>(errors: Errors<T>): string | undefined {
  return Object.values(errors).find(Boolean) as string | undefined
}

export function hasErrors<T>(errors: Errors<T>): boolean {
  return Object.values(errors).some(Boolean)
}

export const UF = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const
