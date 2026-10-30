import { describe, expect, it } from 'vitest'

import {
  applicationForm,
  can,
  employeeInput,
  isValidCpf,
  jobInput,
  maskCpf,
  RECRUITMENT_DEFAULTS,
  ROLE_PERMISSIONS,
  stageMove,
  tenantSettingsInput,
} from './index'

describe('CPF', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
  })
  it('recusa dígito errado e sequências repetidas', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
  })
  it('mascara deixando só os dois últimos dígitos', () => {
    expect(maskCpf('52998224725')).toBe('***.***.***-25')
  })
})

describe('RBAC', () => {
  it('colaborador não lê dados de outros nem dados sensíveis', () => {
    expect(can('employee', 'employees.read')).toBe(false)
    expect(can('employee', 'employees.read_sensitive')).toBe(false)
    expect(can('employee', 'self.read')).toBe(true)
  })
  it('gestor lê a equipe mas não altera cadastro nem vê dados sensíveis', () => {
    expect(can('manager', 'employees.read')).toBe(true)
    expect(can('manager', 'employees.update')).toBe(false)
    expect(can('manager', 'employees.read_sensitive')).toBe(false)
  })
  it('RH não administra usuários nem configurações', () => {
    expect(can('hr', 'users.manage')).toBe(false)
    expect(can('hr', 'settings.manage')).toBe(false)
  })
  it('administrador tem todas as permissões', () => {
    expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(10)
  })
})

describe('employeeInput', () => {
  const base = {
    registration: '0001',
    fullName: 'Pessoa de Teste',
    cpf: '529.982.247-25',
    hireDate: '2026-01-10',
    contractType: 'clt',
  }
  it('normaliza CPF para dígitos', () => {
    expect(employeeInput.parse(base).cpf).toBe('52998224725')
  })
  it('recusa CPF inválido', () => {
    expect(employeeInput.safeParse({ ...base, cpf: '000' }).success).toBe(false)
  })
  it('converte e-mail vazio em null', () => {
    expect(employeeInput.parse({ ...base, email: '' }).email).toBeNull()
  })
})

describe('Recrutamento', () => {
  it('permissões por perfil', () => {
    expect(can('manager', 'recruitment.read')).toBe(true)
    expect(can('manager', 'recruitment.manage')).toBe(false)
    expect(can('manager', 'talent_pool.read')).toBe(false)
    expect(can('hr', 'talent_pool.read')).toBe(true)
    expect(can('employee', 'recruitment.read')).toBe(false)
  })

  it('stageMove exige motivo na recusa e não permite contratar direto', () => {
    expect(stageMove.safeParse({ stage: 'rejected' }).success).toBe(false)
    expect(stageMove.safeParse({ stage: 'rejected', reason: 'Perfil não aderente' }).success).toBe(true)
    expect(stageMove.safeParse({ stage: 'interview' }).success).toBe(true)
    expect(stageMove.safeParse({ stage: 'hired' }).success).toBe(false)
  })

  const validApplication = {
    fullName: 'Maria Souza',
    email: 'maria@exemplo.com',
    phone: '(11) 91234-5678',
    city: 'São Paulo',
    state: 'SP',
    answers: {},
    privacyConsent: true,
    talentPoolConsent: false,
    website: '',
    startedAt: Date.now(),
  }
  it('applicationForm valida consentimento, honeypot e CPF', () => {
    expect(applicationForm.safeParse(validApplication).success).toBe(true)
    expect(applicationForm.safeParse({ ...validApplication, privacyConsent: false }).success).toBe(false)
    expect(applicationForm.safeParse({ ...validApplication, website: 'x' }).success).toBe(false)
    expect(applicationForm.safeParse({ ...validApplication, cpf: '111.111.111-11' }).success).toBe(false)
    expect(applicationForm.safeParse({ ...validApplication, cpf: '529.982.247-25' }).success).toBe(true)
  })

  const validJob = {
    title: 'Pedreiro',
    departmentId: null,
    unitId: null,
    positionId: null,
    contractType: 'clt',
    city: 'Recife',
    state: 'PE',
    workMode: 'site',
    salaryMin: 2000,
    salaryMax: 3000,
    showSalary: false,
    description: 'Atuar em obras residenciais e comerciais.',
    requirements: '',
    benefits: '',
    openings: 1,
    managerUserId: null,
    visibility: 'public',
    questions: [],
  }
  it('jobInput valida faixa salarial e perguntas de escolha', () => {
    expect(jobInput.safeParse(validJob).success).toBe(true)
    expect(jobInput.safeParse({ ...validJob, salaryMin: 3000, salaryMax: 2000 }).success).toBe(false)
    const choice = { kind: 'choice', label: 'Possui CNH?', required: true }
    expect(jobInput.safeParse({ ...validJob, questions: [choice] }).success).toBe(false)
    expect(jobInput.safeParse({ ...validJob, questions: [{ ...choice, options: ['A', 'B'] }] }).success).toBe(true)
  })

  it('configurações aceitam os padrões de recrutamento', () => {
    const parsed = tenantSettingsInput.safeParse({ name: 'Falcão', recruitment: RECRUITMENT_DEFAULTS })
    expect(parsed.success).toBe(true)
    expect(tenantSettingsInput.safeParse({ name: 'Falcão', recruitment: { ...RECRUITMENT_DEFAULTS, talentPoolMonths: 61 } }).success).toBe(false)
  })
})
