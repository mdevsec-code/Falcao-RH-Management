export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} não encontrado.`)
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new AppError(403, 'forbidden', message)
export const badRequest = (message: string) => new AppError(400, 'bad_request', message)

/** Traduz violações de restrição do PostgreSQL em respostas claras. */
export const fromPgError = (error: unknown): AppError | null => {
  const pg = (error as { cause?: unknown })?.cause ?? error
  const code = (pg as { code?: string })?.code
  const constraint = (pg as { constraint?: string })?.constraint ?? ''
  if (code === '23505') {
    const field = CONSTRAINT_LABELS[constraint] ?? 'registro'
    return new AppError(409, 'conflict', `Já existe ${field} com este valor.`)
  }
  if (code === '23503') {
    return new AppError(422, 'invalid_reference', 'Referência inválida ou em uso por outro registro.')
  }
  if (code === '23514') return new AppError(422, 'invalid_value', 'Valor não permitido.')
  return null
}

const CONSTRAINT_LABELS: Record<string, string> = {
  employees_tenant_registration_uq: 'um colaborador com esta matrícula',
  employees_tenant_cpf_uq: 'um colaborador com este CPF',
  departments_tenant_name_uq: 'um departamento',
  units_tenant_name_uq: 'uma unidade',
  cost_centers_tenant_code_uq: 'um centro de custo',
  positions_tenant_title_level_uq: 'um cargo',
  memberships_tenant_user_uq: 'um acesso para este usuário',
  user_email_unique: 'um usuário com este e-mail',
}
