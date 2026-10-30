/**
 * Perfis e permissões (RBAC).
 *
 * Os perfis do MVP são fixos e definidos em código (ADR-0006): a matriz é
 * versionada, revisável em PR e testada. Perfis customizáveis por empresa
 * entram no roadmap, gravados em banco sobre estas mesmas permissões.
 */

export const ROLES = ['admin', 'hr', 'manager', 'employee'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  hr: 'Recursos Humanos',
  manager: 'Gestor',
  employee: 'Colaborador',
}

export const PERMISSIONS = [
  'dashboard.view',
  'org.read',
  'org.manage',
  'employees.read',
  'employees.read_sensitive',
  'employees.create',
  'employees.update',
  'employees.terminate',
  'employees.import',
  'employees.export',
  'documents.read',
  'documents.manage',
  'requests.read',
  'requests.approve',
  'requests.manage',
  'users.manage',
  'audit.read',
  'settings.manage',
  'self.read',
  'self.update',
  'self.request',
] as const
export type Permission = (typeof PERMISSIONS)[number]

/**
 * Até onde um perfil enxerga colaboradores:
 * - `all`: toda a organização;
 * - `team`: subordinados diretos e departamentos que gerencia;
 * - `self`: apenas o próprio cadastro.
 */
export type DataScope = 'all' | 'team' | 'self'

const SELF: Permission[] = ['self.read', 'self.update', 'self.request']

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  hr: [
    'dashboard.view',
    'org.read',
    'org.manage',
    'employees.read',
    'employees.read_sensitive',
    'employees.create',
    'employees.update',
    'employees.terminate',
    'employees.import',
    'employees.export',
    'documents.read',
    'documents.manage',
    'requests.read',
    'requests.approve',
    'requests.manage',
    'audit.read',
    ...SELF,
  ],
  manager: ['dashboard.view', 'org.read', 'employees.read', 'requests.read', 'requests.approve', ...SELF],
  employee: ['org.read', ...SELF],
}

export const ROLE_SCOPE: Record<Role, DataScope> = {
  admin: 'all',
  hr: 'all',
  manager: 'team',
  employee: 'self',
}

export const can = (role: Role, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission)
