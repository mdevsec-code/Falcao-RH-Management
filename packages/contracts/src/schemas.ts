import { z } from 'zod'

import { isValidCpf, onlyDigits } from './cpf'
import { ROLES } from './permissions'

// ---------- comuns ----------

export const uuid = z.uuid()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform(value => (value === '' ? null : value))
    .nullable()
    .optional()
const isoDate = z.iso.date()

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  })

// ---------- estrutura organizacional ----------

export const unitInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: optionalText(30),
  city: optionalText(80),
  state: z
    .string()
    .trim()
    .length(2)
    .transform(value => value.toUpperCase())
    .nullable()
    .optional(),
})
export type UnitInput = z.infer<typeof unitInput>

export const costCenterInput = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(2).max(120),
})
export type CostCenterInput = z.infer<typeof costCenterInput>

export const positionInput = z.object({
  title: z.string().trim().min(2).max(120),
  cbo: optionalText(10),
  level: optionalText(40),
})
export type PositionInput = z.infer<typeof positionInput>

export const departmentInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: optionalText(30),
  parentId: uuid.nullable().optional(),
  managerEmployeeId: uuid.nullable().optional(),
  unitId: uuid.nullable().optional(),
  costCenterId: uuid.nullable().optional(),
})
export type DepartmentInput = z.infer<typeof departmentInput>

// ---------- colaboradores ----------

export const CONTRACT_TYPES = ['clt', 'pj', 'estagio', 'aprendiz', 'temporario', 'intermitente'] as const
export const CONTRACT_TYPE_LABELS: Record<(typeof CONTRACT_TYPES)[number], string> = {
  clt: 'CLT',
  pj: 'PJ',
  estagio: 'Estágio',
  aprendiz: 'Jovem aprendiz',
  temporario: 'Temporário',
  intermitente: 'Intermitente',
}

export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated'] as const
export const EMPLOYEE_STATUS_LABELS: Record<(typeof EMPLOYEE_STATUSES)[number], string> = {
  active: 'Ativo',
  on_leave: 'Afastado',
  terminated: 'Desligado',
}

export const addressSchema = z.object({
  zip: optionalText(9),
  street: optionalText(160),
  number: optionalText(20),
  complement: optionalText(80),
  district: optionalText(80),
  city: optionalText(80),
  state: optionalText(2),
})

export const employeeInput = z.object({
  registration: z.string().trim().min(1).max(30),
  fullName: z.string().trim().min(3).max(160),
  socialName: optionalText(160),
  cpf: z
    .string()
    .transform(onlyDigits)
    .refine(isValidCpf, 'CPF inválido'),
  birthDate: isoDate.nullable().optional(),
  email: z.email().nullable().optional().or(z.literal('').transform(() => null)),
  phone: optionalText(30),
  address: addressSchema.nullable().optional(),
  departmentId: uuid.nullable().optional(),
  positionId: uuid.nullable().optional(),
  managerId: uuid.nullable().optional(),
  unitId: uuid.nullable().optional(),
  costCenterId: uuid.nullable().optional(),
  hireDate: isoDate,
  contractType: z.enum(CONTRACT_TYPES),
  workSchedule: optionalText(120),
})
export type EmployeeInput = z.infer<typeof employeeInput>

export const employeeUpdate = employeeInput.partial()
export type EmployeeUpdate = z.infer<typeof employeeUpdate>

export const employeeStatusChange = z.object({
  status: z.enum(EMPLOYEE_STATUSES),
  effectiveDate: isoDate,
  reason: z.string().trim().min(3).max(500),
})
export type EmployeeStatusChange = z.infer<typeof employeeStatusChange>

export const employeeFilters = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  departmentId: uuid.optional(),
  unitId: uuid.optional(),
  sort: z.enum(['name', 'hireDate', 'registration']).default('name'),
})
export type EmployeeFilters = z.infer<typeof employeeFilters>

// ---------- dashboard ----------

export const dashboardFilters = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  departmentId: uuid.optional(),
  unitId: uuid.optional(),
})
export type DashboardFilters = z.infer<typeof dashboardFilters>

// ---------- usuários ----------

export const inviteInput = z.object({
  name: z.string().trim().min(3).max(160),
  email: z.email(),
  role: z.enum(ROLES),
  employeeId: uuid.nullable().optional(),
})
export type InviteInput = z.infer<typeof inviteInput>
