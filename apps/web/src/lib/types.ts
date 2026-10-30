/**
 * Formatos de resposta da API. Espelham os serviços de apps/api; quando
 * divergirem, o teste de tipos do build acusa no uso.
 * TODO(ROADMAP): gerar a partir de esquemas de resposta em @falcao-rh/contracts.
 */
import type {
  AbsenceKind,
  ApproverKind,
  CONTRACT_TYPES,
  DataScope,
  EMPLOYEE_STATUSES,
  NotificationKind,
  Permission,
  RequestStatus,
  RequestType,
  Role,
} from '@falcao-rh/contracts'

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]
export type ContractType = (typeof CONTRACT_TYPES)[number]

export type Me = {
  user: { id: string; name: string; email: string }
  tenant: { id: string; name: string; slug: string }
  role: Role
  scope: DataScope
  employeeId: string | null
  permissions: Permission[]
  mfaPending: boolean
  organizations: { tenantId: string; tenantName: string; role: Role }[]
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number }

export type EmployeeListItem = {
  id: string
  registration: string
  fullName: string
  socialName: string | null
  email: string | null
  status: EmployeeStatus
  contractType: ContractType
  hireDate: string
  departmentId: string | null
  departmentName: string | null
  positionTitle: string | null
  unitName: string | null
  managerName: string | null
}

export type Address = {
  zip?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
}

export type EmployeeEvent = {
  id: string
  type: 'hired' | 'data_updated' | 'department_changed' | 'position_changed' | 'manager_changed' | 'status_changed'
  effectiveDate: string
  reason: string | null
  fields: string[]
  actorName: string | null
  createdAt: string
}

export type EmployeeDetail = {
  id: string
  registration: string
  fullName: string
  socialName: string | null
  cpf: string
  birthDate: string | null
  email: string | null
  phone: string | null
  address: Address | null
  departmentId: string | null
  positionId: string | null
  managerId: string | null
  unitId: string | null
  costCenterId: string | null
  hireDate: string
  terminationDate: string | null
  contractType: ContractType
  status: EmployeeStatus
  workSchedule: string | null
  isMasked: boolean
  departmentName: string | null
  positionTitle: string | null
  unitName: string | null
  costCenterName: string | null
  managerName: string | null
  history: EmployeeEvent[]
}

export type Unit = { id: string; name: string; code: string | null; city: string | null; state: string | null }
export type CostCenter = { id: string; code: string; name: string }
export type Position = { id: string; title: string; cbo: string | null; level: string | null }
export type Department = {
  id: string
  name: string
  code: string | null
  parentId: string | null
  parentName: string | null
  managerEmployeeId: string | null
  managerName: string | null
  unitId: string | null
  unitName: string | null
  costCenterId: string | null
  costCenterName: string | null
  headcount: number
}

export type Member = {
  id: string
  userId: string
  name: string
  email: string
  role: Role
  status: 'active' | 'disabled'
  employeeId: string | null
  employeeName: string | null
  createdAt: string
}

export type Dashboard = {
  period: { from: string; to: string }
  headcount: { active: number; onLeave: number; total: number }
  movement: { hires: number; terminations: number; turnover: number | null }
  distribution: Record<'byDepartment' | 'byUnit' | 'byCostCenter', { label: string; total: number }[]>
  trend: { month: string; headcount: number; hires: number; terminations: number }[]
  birthdays: { id: string; name: string; day: number; departmentName: string | null }[]
  recentHires: { id: string; name: string; hireDate: string; departmentName: string | null; positionTitle: string | null }[]
  activity: { id: string; type: EmployeeEvent['type']; effectiveDate: string; createdAt: string; employeeId: string; employeeName: string }[]
  alerts: { key: string; label: string; total: number; href: string }[]
  absence: { absenteeism: number | null; lostDays: number; workdays: number }
  requests: {
    pending: number
    upcomingVacations: { id: string; employeeId: string; name: string; startDate: string; endDate: string; days: number }[]
  }
}

export type RequestItem = {
  id: string
  employeeId: string
  employeeName: string
  departmentName: string | null
  type: RequestType
  absenceKind: AbsenceKind | null
  status: RequestStatus
  startDate: string
  endDate: string
  days: number
  notes: string | null
  createdAt: string
  currentStep: ApproverKind | null
  isRestricted: boolean
}

export type RequestDetail = Omit<RequestItem, 'currentStep'> & {
  documentId: string | null
  decidedAt: string | null
  steps: {
    id: string
    position: number
    approverKind: ApproverKind
    approverName: string | null
    status: 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'
    decidedByName: string | null
    decidedAt: string | null
    comment: string | null
  }[]
  canDecide: boolean
  canCancel: boolean
}

export type CalendarItem = Pick<
  RequestItem,
  'id' | 'employeeId' | 'employeeName' | 'departmentName' | 'type' | 'absenceKind' | 'status' | 'startDate' | 'endDate' | 'days' | 'isRestricted'
>

export type VacationBalance = {
  available: number
  periods: {
    start: string
    end: string
    deadline: string
    complete: boolean
    unjustifiedAbsences: number
    entitled: number
    approved: number
    pending: number
    remaining: number
    fractions: number[]
  }[]
}

export type DocumentCategory = {
  id: string
  name: string
  employeeVisible: boolean
  employeeUpload: boolean
  sensitive: boolean
  requiresExpiry: boolean
}

export type DocumentItem = {
  id: string
  title: string
  employeeId: string | null
  employeeName: string | null
  categoryId: string
  categoryName: string
  sensitive: boolean
  expiresAt: string | null
  status: 'active' | 'archived'
  currentVersion: number
  filename: string
  mimeType: string
  sizeBytes: number
  updatedAt: string
}

export type DocumentDetail = {
  id: string
  title: string
  employeeId: string | null
  categoryId: string
  categoryName: string
  sensitive: boolean
  expiresAt: string | null
  status: 'active' | 'archived'
  currentVersion: number
  versions: { version: number; filename: string; mimeType: string; sizeBytes: number; uploadedByName: string | null; createdAt: string }[]
}

export type AppNotification = {
  id: string
  kind: NotificationKind
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export type OrgSettings = { name: string; legalName: string | null; cnpj: string | null; requireMfaFor: Role[] }
export type ApprovalFlow = { id: string; requestType: RequestType; departmentId: string | null; departmentName: string | null; steps: ApproverKind[] }

export type ImportReport = {
  total: number
  valid: number
  invalid: number
  imported: number
  rows: { line: number; fullName: string; registration: string; errors: string[] }[]
  toCreate: { departments: string[]; positions: string[]; units: string[] }
}
